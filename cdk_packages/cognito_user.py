#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import os.path
import types

import aws_cdk as cdk
import boto3
from aws_cdk import (
    aws_secretsmanager as secretsmanager,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_logs as logs,
    aws_ssm as ssm,
    aws_dynamodb as dynamodb,
    custom_resources as cr,
)
from cdk_nag import NagSuppressions
from constructs import Construct

import cdk_packages.utils as utils
import cdk_packages.genai_chatbot_params as genai_chatbot_params

dirname = os.path.dirname(__file__)

client_cloudformation = boto3.client('cloudformation')
client_cognito_idp = boto3.client('cognito-idp')
client_apigatewayv2 = boto3.client('apigatewayv2')
client_dynamodb = boto3.client('dynamodb')


class CognitoUser(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        # CDK custom resource for Cognito user ID. This user ID is used by the Wickr IO integration code
        # to interact with the AWS GenAI chatbot backend.
        self.event_handler_role = iam.Role(
            self, 'Custom resource - Cognito user - lambda role',
            assumed_by=iam.ServicePrincipal('lambda.amazonaws.com'),
        )
        self.event_handler_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    'cognito-idp:AdminCreateUser',
                    'cognito-idp:AdminDeleteUser',
                    'cognito-idp:ListUsers',
                ],
                resources=[
                    f'{utils.get_user_pool_arn(genai_chatbot_params.GEN_AI_CHATBOT_STACK_NAME)}',
                ]
            )
        )
        event_handler_log_group = logs.LogGroup(
            self, 'Custom resource - Cognito user - log group',
            retention=logs.RetentionDays.THREE_MONTHS,
        )
        event_handler_log_group.grant_write(self.event_handler_role)
        event_handler_fn = lambda_.Function(
            self, 'Custom resource - Cognito user - lambda function',
            role=self.event_handler_role,
            code=lambda_.Code.from_asset(os.path.join(dirname, 'assets', 'lambda_functions', 'cr_cognito_user')),
            handler='cr_cognito_user.on_event',
            timeout=cdk.Duration.minutes(1),
            runtime=lambda_.Runtime.PYTHON_3_12,
            log_group=event_handler_log_group,
        )
        cr_provider = cr.Provider(
            self, 'Custom resource - Cognito user - provider',
            on_event_handler=event_handler_fn,
        )
        genai_stack_params = utils.get_genai_stack_params(genai_chatbot_params.GEN_AI_CHATBOT_STACK_NAME)
        # genai_stack_params.websocket_endpoint = utils.get_websocket_endpoint(genai_chatbot_params.GEN_AI_CHATBOT_STACK_NAME)
        cdk.CustomResource(
            self, 'Custom resource - Cognito user',
            service_token=cr_provider.service_token,
            properties={
                'WickrUserName': params.wickrio_config.bot_user_id,
                'EmailDomain': genai_chatbot_params.GEN_AI_CHATBOT_COGNITO_USER_EMAIL_DOMAIN,
                # TODO: verify required parameters
                'AuthenticationUserPoolWebClientId': genai_stack_params.user_pool_web_client_id,
                'AuthenticationUserPoolId': genai_stack_params.user_pool_id,
                # 'ChatBotApiRestApiChatBotApiEndpoint': genai_stack_params.websocket_endpoint,
            },
        )
        # TODO: verify required parameters
        self.wickrio_cognito_config = ssm.StringParameter(
            self, 'Parameter - Cognito user',
            parameter_name='/Wickr-GenAI-Chatbot/wickr-io-cognito-config',
            string_value=json.dumps(
                {
                    'user_pool_web_client_id': genai_stack_params.user_pool_web_client_id,
                    'user_pool_id': genai_stack_params.user_pool_id,
                    # 'chat_bot_websocket_endpoint': genai_stack_params.websocket_endpoint,
                }
            )
        )
        self.wickrio_cognito_config.grant_read(params.iam_user.wickrio_user)
        self.wickrio_cognito_config.grant_read(self.event_handler_role)
        self.wickrio_cognito_config.grant_write(self.event_handler_role)

        # Secret for Cognito user password
        self.wickrio_cognito_user_secret = secretsmanager.Secret(
            self, 'Secret - Cognito user password',
            secret_name='WickrIO-Cognito-User-Password',
        )

        # Get the DynamoDB table with the RAG workspaces and store in SSM Parameter Store.
        rag_workspaces_table_name = utils.get_rag_workspaces_table_name(genai_chatbot_params.GEN_AI_CHATBOT_RAG_WORKSPACES_TABLE_NAME)
        ssm.StringParameter(
            self, 'Parameter - RagWorkspacesTableName',
            parameter_name='/Wickr-GenAI-Chatbot/model-rag-params',
            string_value=json.dumps(
                {
                    'model_name': genai_chatbot_params.GEN_AI_CHATBOT_MODEL_NAME,
                    'rag_workspace_name': genai_chatbot_params.GEN_AI_CHATBOT_RAG_WORKSPACE_NAME,
                    'rag_workspaces_table_name': rag_workspaces_table_name,
                }
            ),
            description='LLM model and RAG workspaces DynamoDB table.',
        ).grant_read(params.iam_user.wickrio_user)
        # Allow Wickr IO user to read the RAG workspaces DynamoDB table.
        dynamodb.Table.from_table_name(
            self, 'RagWorkspacesTable',
            table_name=rag_workspaces_table_name,
        ).grant_read_data(params.iam_user.wickrio_user)

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions_by_path(
            cdk.Stack.of(self),
            path=f'{cr_provider.node.path}/framework-onEvent/Resource',
            suppressions=[
                {
                    'id': 'AwsSolutions-L1',
                    'reason': 'Python 3.12 is the latest version supported by AWS Lambda (as of 2024-02-10).',
                },
            ],
            apply_to_children=True,
        )

        NagSuppressions.add_resource_suppressions_by_path(
            cdk.Stack.of(self),
            path=f'{cr_provider.node.path}/framework-onEvent/ServiceRole/Resource',
            suppressions=[
                {
                    'id': 'AwsSolutions-IAM4',
                    'reason': 'We are using default AWS managed policy for Lambda execution role: '
                              'https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSLambdaBasicExecutionRole.html',
                    'appliesTo': [
                        'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
                },
            ],
            apply_to_children=True,
        )

        NagSuppressions.add_resource_suppressions_by_path(
            cdk.Stack.of(self),
            path=f'{cr_provider.node.path}/framework-onEvent/ServiceRole/DefaultPolicy/Resource',
            suppressions=[
                {
                    'id': 'AwsSolutions-IAM5',
                    'reason': 'We are using default AWS managed policy for Lambda execution role: '
                              'https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSLambdaBasicExecutionRole.html',
                    'appliesTo': [
                        'Resource::<WickrIOCognitouserCustomresourceCognitouserlambdafunctionD4019A63.Arn>:*'],
                },
            ],
            apply_to_children=True,
        )
