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


class IamUserRotation(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        region = cdk.Stack.of(self).region
        account = cdk.Stack.of(self).account

        # Add secret rotation for Wickr IO IAM user access key.
        lambda_role = iam.Role(
            self, 'Secrets rotation - lambda role',
            assumed_by=iam.ServicePrincipal('lambda.amazonaws.com'),
        )
        params.iam_user.wickrio_user_secret.grant_read(lambda_role)
        params.iam_user.wickrio_user_secret.grant_write(lambda_role)
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    'iam:CreateAccessKey',
                    'iam:DeleteAccessKey'
                ],
                resources=[f'{params.iam_user.wickrio_user.user_arn}'],
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
            code=lambda_.Code.from_asset(os.path.join(dirname, 'assets', 'lambda_functions', 'secret_rotation_iam')),
            handler='secret_rotation_iam.lambda_handler',
            timeout=cdk.Duration.minutes(1),
            runtime=lambda_.Runtime.PYTHON_3_12,
            log_group=log_group,
        )
        params.iam_user.wickrio_user_secret.add_rotation_schedule(
            'Wickr IO IAM user access key rotation schedule',
            automatically_after=cdk.Duration.days(30),
            rotation_lambda=secret_rotation,
        )

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions(
            construct=secret_rotation.role,
            suppressions=[
                {
                    'id': 'AwsSolutions-IAM5',
                    'reason': 'Resource ARNs narrowed down to the minimum. Wildcards required. Default '
                              'permission set by CDK',
                    'appliesTo': [
                        'Resource::*',
                        f'Resource::arn:aws:logs:{region}:{account}:*',
                    ],
                },
            ],
            apply_to_children=True,
        )
