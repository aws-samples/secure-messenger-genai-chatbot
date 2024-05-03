#!/usr/bin/env python
# -*- coding: utf-8 -*-

import types

import boto3

client_cloudformation = boto3.client('cloudformation')
client_cognito_idp = boto3.client('cognito-idp')
client_apigatewayv2 = boto3.client('apigatewayv2')
client_dynamodb = boto3.client('dynamodb')


def get_genai_stack_params(stack_name):
    """
    Create a user in the Cognito pool of the AWS GenAI Chatbot application
    (see https://github.com/aws-samples/aws-genai-llm-chatbot). This user will be used by the Wickr IO integration
    code to interact with the chatbot API. The AWS GenAI Chatbot application needs to be deployed before running
    this deployment.

    :return: password
    """
    user = types.SimpleNamespace()

    stack_output = get_cf_stack_output(stack_name)
    try:
        user.user_pool_web_client_id = value_by_key_prefix(stack_output, 'AuthenticationUserPoolWebClientId')
        user.user_pool_id = value_by_key_prefix(stack_output, 'AuthenticationUserPoolId')
        user.chat_bot_api_endpoint = value_by_key_prefix(stack_output, 'ChatBotApiRestApiChatBotApiEndpoint')
    except KeyError as e:
        raise ValueError(
            f'The following error occurred while trying to get attributes from the Cognito user pool:\n\n'
            f'{e}\n\n'
        )

    return user


def value_by_key_prefix(d, partial):
    """
    Get the value of a key in a dictionary starting with a given prefix.

    :param d: The dictionary.
    :param partial: The prefix.
    :return: The value.
    """
    matches = [val for key, val in d.items() if key.startswith(partial)]
    if not matches:
        raise KeyError(f'Cannot find key starting with {partial}')
    if len(matches) > 1:
        raise ValueError(f'{partial} matches more than one key')
    return matches[0]


def get_user_pool_arn(stack_name):
    """
    Get the ARN of the Cognito user pool.

    :param stack_name:
    :return: ARN of the Cognito user pool
    """
    stack_output = get_cf_stack_output(stack_name)
    pool_id = value_by_key_prefix(stack_output, 'AuthenticationUserPoolId')
    pool_arn = client_cognito_idp.describe_user_pool(UserPoolId=pool_id)['UserPool']['Arn']
    return pool_arn


def get_cf_stack_output(stack_name):
    """
    Get the output values of a CloudFormation stack

    :param stack_name: Name of CloudFormation stack`
    :return: CloudFormation stack output as dict
    """
    try:
        gen_ai_chatbot_stack = client_cloudformation.describe_stacks(
            StackName=stack_name,
        )['Stacks'][0]
    except client_cloudformation.exceptions.ClientError as e:
        raise ValueError(
            f'The following error occurred while trying to find the CloudFormation stack {stack_name}:\n\n'
            f'{e}\n\n'
            f'Please make sure you have deployed the project "Multi-Model and Multi-RAG Powered '
            f'Chatbot" (https://github.com/aws-samples/aws-genai-llm-chatbot) in the same region.'
        )
    output = {
        entry['OutputKey']: entry['OutputValue']
        for entry in gen_ai_chatbot_stack['Outputs']
    }
    return output


def get_websocket_endpoint(stack_name):
    """
    Get the websocket API endpoint of the AWS GenAI Chatbot application. The Wickr IO integration uses this
    endpoint to submit messages and receive responses.

    :return: The websocket endpoint.
    """
    response = client_apigatewayv2.get_apis()
    gen_ai_websocket_api = next(
        item
        for item in response['Items']
        if item['Tags'].get('aws:cloudformation:stack-name', None) == stack_name
    )
    return gen_ai_websocket_api['ApiEndpoint']


def get_rag_workspaces_table_name(table_name):
    """
    From the AWS GenAI Chatbot installation in the same region as this deployment, get the name of the DynamoDB
    table that contains the information about the RAG workspaces.

    :return: The name of the DynamoDB table.
    """
    # Get the list of DynamoDB tables in the same region as this deployment.
    response = client_dynamodb.list_tables()
    tables = response['TableNames']
    # Find the table that contains the RAG workspaces.
    rag_workspaces_table_name = next(
        table
        for table in tables
        if table.startswith(table_name)
    )
    return rag_workspaces_table_name
