#!/usr/bin/env python3

import os.path
import tarfile
import re

import aws_cdk as cdk
from aws_cdk import (
    aws_ssm as ssm,
)
from aws_cdk.aws_s3_assets import Asset
from cdk_nag import NagSuppressions
from constructs import Construct

dirname = os.path.dirname(__file__)


class WickrIOCode(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        # zip the files for the Wickr IO integration code

        source_dir = os.path.join(dirname, '..', 'genai-advisor-bot')
        output_filename = os.path.join(dirname, 'assets', 'software')
        exclude = ['.idea', 'node_modules', '__tests__', 'tests', 'coverage']
        with tarfile.open(f'{output_filename}.tar.gz', 'w:gz') as tar:
            exclude_pattern = f'(?:{"|".join(exclude)})'
            tar.add(
                source_dir,
                arcname='',
                filter=lambda tarinfo: None if re.match(exclude_pattern, tarinfo.name) else tarinfo
            )

        # upload Wickr IO integration code to CDK S3 bucket

        self.integration_code = Asset(
            self, 'asset Wickr IO integration code',
            path=os.path.join(dirname, 'assets', 'software.tar.gz')
        )
        self.integration_code.grant_read(params.wickrio_instance.ec2_instance_role)
        self.integration_code.bucket.grant_write(params.wickrio_instance.ec2_instance_role)
        ssm.StringParameter(
            self, 'Wickr IO integration code',
            parameter_name='/Wickr-GenAI-Chatbot/wickr-io-integration-code',
            string_value=self.integration_code.s3_object_url
        ).grant_read(params.wickrio_instance.ec2_instance_role)

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions(
            construct=params.wickrio_instance.ec2_instance_role,
            suppressions=[
                {
                    'id': 'AwsSolutions-IAM5',
                    'reason': 'Default read and write permissions generated by using CDK function grant_write().',
                    'appliesTo': [
                        'Action::s3:GetBucket*',
                        'Action::s3:GetObject*',
                        'Action::s3:List*',
                        'Action::s3:Abort*',
                        'Action::s3:DeleteObject*',
                        f'Resource::arn:aws:s3:::{self.integration_code.bucket.bucket_name}/*',
                    ]
                },
            ],
            apply_to_children=True,
        )
