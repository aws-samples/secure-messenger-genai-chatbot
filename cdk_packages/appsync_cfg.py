#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import os.path

import boto3
from aws_cdk import (
    aws_ssm as ssm,
)
from constructs import Construct

import cdk_packages.utils as utils
import cdk_packages.genai_chatbot_params as genai_chatbot_params

dirname = os.path.dirname(__file__)

client_appsync = boto3.client('appsync')


class AppSyncCfg(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        # Retrieve AWS Chatbot GraphQL API definition and store in Parameter Store
        genai_stack_params = utils.get_genai_stack_params(genai_chatbot_params.GEN_AI_CHATBOT_STACK_NAME)
        graphql_api_definition = client_appsync.get_graphql_api(
            apiId=genai_stack_params.chat_bot_api_graphql_id
        )
        ssm_parameter = ssm.StringParameter(
            self, 'Chatbot GraphQL API definition',
            parameter_name='/Wickr-GenAI-Chatbot/chatbot-graphql-api-definition',
            string_value=json.dumps(graphql_api_definition['graphqlApi'])
        )
        ssm_parameter.grant_read(params.iam_user.wickrio_user)
