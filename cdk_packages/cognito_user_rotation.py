#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os.path

import aws_cdk as cdk
import boto3
from aws_cdk import (
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_logs as logs,
)
from cdk_nag import NagSuppressions
from constructs import Construct

import cdk_packages.utils as utils
import cdk_packages.genai_chatbot_params as genai_chatbot_params

dirname = os.path.dirname(__file__)

client_secretsmanager = boto3.client('secretsmanager')
client_cloudformation = boto3.client('cloudformation')
client_cognito_idp = boto3.client('cognito-idp')
client_apigatewayv2 = boto3.client('apigatewayv2')
client_dynamodb = boto3.client('dynamodb')


class CognitoUserRotation(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        region = cdk.Stack.of(self).region
        account = cdk.Stack.of(self).account

        # Secret rotation for Cognito user password

        lambda_role = iam.Role(
            self, 'Secrets rotation - lambda role',
            assumed_by=iam.ServicePrincipal('lambda.amazonaws.com'),
        )
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    'cognito-idp:AdminSetUserPassword',
                ],
                resources=[
                    f'{utils.get_user_pool_arn(genai_chatbot_params.GEN_AI_CHATBOT_STACK_NAME)}',
                ]
            )
        )
        log_group = logs.LogGroup(
            self, 'Secrets rotation - log group',
            retention=logs.RetentionDays.THREE_MONTHS,
        )
        log_group.grant_write(lambda_role)
        secret_rotation = lambda_.Function(
            self, 'Secrets rotation - lambda function',
            role=lambda_role,
            code=lambda_.Code.from_asset(
                os.path.join(dirname, 'assets', 'lambda_functions', 'secret_rotation_cognito')),
            handler='secret_rotation_cognito.lambda_handler',
            timeout=cdk.Duration.minutes(1),
            runtime=lambda_.Runtime.PYTHON_3_12,
            log_group=log_group,
        )
        params.cognito_user.wickrio_cognito_config.grant_read(secret_rotation)
        params.cognito_user.wickrio_cognito_user_secret.add_rotation_schedule(
            'rotation schedule',
            automatically_after=cdk.Duration.days(30),
            rotation_lambda=secret_rotation,
        )
        params.cognito_user.wickrio_cognito_user_secret.grant_read(params.iam_user.wickrio_user)
        params.cognito_user.event_handler_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    'secretsmanager:RotateSecret',
                ],
                resources=[
                    f'{params.cognito_user.wickrio_cognito_user_secret.secret_arn}',
                ]
            )
        )

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions(
            construct=secret_rotation.role,
            suppressions=[
                {
                    'id': 'AwsSolutions-IAM5',
                    'reason': 'Resource ARNs narrowed down to the minimum. Wildcards required.',
                    'appliesTo': [
                        'Resource::*',
                        f'Resource::arn:aws:logs:{region}:{account}:*',
                    ],
                },
            ],
            apply_to_children=True,
        )
