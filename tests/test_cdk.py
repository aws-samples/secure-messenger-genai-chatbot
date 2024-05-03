#!/usr/bin/env python3

import pytest
from aws_cdk.assertions import Template


def test_synthesizes_properly(mock_externals):
    import app

    template = Template.from_stack(app.cdk_stack)

    template_json = template.to_json()

    # VPC
    template.resource_count_is('AWS::EC2::VPC', 1)
    assert len(template.find_resources('AWS::EC2::Subnet')) > 2
    template.resource_count_is('AWS::EC2::InternetGateway', 1)
    template.resource_count_is('Custom::VpcRestrictDefaultSG', 1)

    # EC2 instance
    template.resource_count_is('AWS::EC2::Instance', 1)
    template.has_resource_properties('AWS::IAM::Role', {'Description': 'Role for EC2 instance'})
    template.resource_count_is('AWS::IAM::InstanceProfile', 1)

    # Wickr IO user
    template.has_resource_properties('AWS::IAM::User', {'UserName': 'wickr-io-user'})

    # Configurations stored in SSM Parameter Store and Secrets
    template.has_resource_properties('AWS::SSM::Parameter', {'Name': '/Wickr-GenAI-Chatbot/wickr-io-integration-code'})
    template.has_resource_properties('AWS::SSM::Parameter', {'Name': '/Wickr-GenAI-Chatbot/model-rag-params'})
    template.has_resource_properties('AWS::SecretsManager::Secret', {'Name': 'WickrIO-IAM-User-Secret'})
    template.has_resource_properties('AWS::SecretsManager::Secret', {'Name': 'WickrIO-Cognito-User-Secret'})
    template.has_resource_properties('AWS::SecretsManager::Secret', {'Name': 'WickrIO-Config'})


@pytest.fixture
def mock_externals(mocker):
    """
    Mock external dependencies so that the code can be tested without any deployments.

    :param mocker:
    :return:
    """

    # Mock values submitted through the --context option to the cdk command. The command line call looks like
    # this: cdk deploy --context bot_user_id=exampleUserID --context bot_password=examplePassword.
    #
    # mock_WickrIOConfig = mocker.patch('cdk_packages.wickrio_config.WickrIOConfig')
    # instance = mock_WickrIOConfig.return_value
    # instance.node.try_get_context.return_value = 'mocked_user_id'
    # instance.node.try_get_context.return_value = 'mocked_password'

    # Mock calls to CloudFormation API.
    mocker.patch(
        'cdk_packages.cognito_user.client_cloudformation.describe_stacks',
        return_value={
            'Stacks': [
                {
                    'Outputs': [
                        {'OutputKey': 'AuthenticationUserPoolWebClientId', 'OutputValue': 'mocked_value'},
                        {'OutputKey': 'AuthenticationUserPoolId', 'OutputValue': 'mocked_value'},
                        {'OutputKey': 'ChatBotApiRestApiChatBotApiEndpoint', 'OutputValue': 'mocked_value'},
                    ]
                }
            ]
        }
    )

    # Mock calls to Cognito API.
    mocker.patch('cdk_packages.cognito_user.client_cognito_idp.admin_create_user')
    mocker.patch('cdk_packages.cognito_user.client_cognito_idp.admin_set_user_password')

    # Mock calls to API Gateway API.
    mocker.patch(
        'cdk_packages.cognito_user.client_apigatewayv2.get_apis',
        return_value={
            'Items': [
                {
                    'Tags': {
                        'aws:cloudformation:stack-name': 'GenAIChatBotStack'
                    },
                    'ApiEndpoint': 'mocked_ApiEndpoint',
                }
            ]
        }
    )

    # Mock calls to DynamoDB API.
    mocker.patch(
        'cdk_packages.cognito_user.client_dynamodb.list_tables',
        return_value={
            'TableNames': [
                'GenAIChatBotStack-RagEnginesRagDynamoDBTablesWorkspaces',
            ]
        }
    )

    yield
