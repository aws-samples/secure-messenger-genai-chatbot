#!/usr/bin/env python3

import json
import os.path

import aws_cdk as cdk
from aws_cdk import (
    aws_secretsmanager as secretsmanager,
    SecretValue as SecretValue,
    aws_logs as logs,
    aws_lambda as lambda_,
    aws_ssm as ssm,
    aws_iam as iam,
)
from aws_cdk.aws_s3_assets import Asset
from cdk_nag import NagSuppressions
from constructs import Construct

dirname = os.path.dirname(__file__)


class WickrIOConfig(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        # Store Wickr IO configuration in AWS Secrets Manager. The user ID and password for the Wickr IO bot
        # are submitted at deployment time via context:
        # cdk deploy --context bot_user_id=exampleUserID --context bot_password=examplePassword
        self.bot_user_id = self.node.try_get_context('bot_user_id') if self.node.try_get_context('bot_user_id') else ''
        bot_password = self.node.try_get_context('bot_password') if self.node.try_get_context('bot_password') else ''
        wickr_config = json.load(open(os.path.join(dirname, 'assets', 'wickr_config.json')))
        wickr_config['clients'][0]['name'] = self.bot_user_id
        wickr_config['clients'][0]['password'] = bot_password
        wickr_config['clients'][0]['integration'] = self.bot_user_id
        wickr_config['clients'][0]['tokens'].append(
            {
                'name': 'CLIENT_NAME',
                'value': self.bot_user_id
            }
        )
        wickr_config['clients'][0]['tokens'].append(
            {
                'name': 'WICKRIO_BOT_NAME',
                'value': self.bot_user_id
            }
        )
        wickr_config['clients'][0]['tokens'].append(
            {
                'name': 'AWS_REGION',
                'value': cdk.Stack.of(self).region
            }
        )
        escaped_json = json.dumps(wickr_config).replace('"', '\\"').replace('\n', '')
        self.wickrio_config = secretsmanager.Secret(
            self, 'WickrIO Config',
            secret_name='WickrIO-Config',
            secret_string_value=SecretValue.unsafe_plain_text(
                '{"wickr_config":"' + escaped_json + '"}'
            ),
        )
        self.wickrio_config.grant_read(params.wickrio_instance.ec2_instance_role)

        ssm.StringParameter(
            self, 'Wickr IO bot user ID',
            parameter_name='/Wickr-GenAI-Chatbot/wickr-io-bot-user-id',
            string_value=self.bot_user_id
        ).grant_read(params.wickrio_instance.ec2_instance_role)

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions(
            construct=self.wickrio_config,
            suppressions=[
                {
                    'id': 'AwsSolutions-SMG4',
                    'reason': 'No secret rotation configured. The Wickr IO bot user ID and password will be manually'
                              'configured in the Wickr Admin console. It is recommendend to change the Wickr IO bot '
                              'password at minimum every 90 days. After updating the Wickr IO bot password, run '
                              '"cdk deploy" with the updated credentials (see instructions in README.md).',
                },
            ],
            apply_to_children=True,
        )
