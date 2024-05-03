#!/usr/bin/env python3

import aws_cdk as cdk
import boto3
import cdk_nag
from aws_cdk import Aspects

from cdk_packages.wickr_genai_chatbot_stack import WickrGenaiChatbotStack

"""
Set the environment explicitly. This is necessary to get subnets in all availability zones.
See also: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.Stack.html#availabilityzones
"If the stack is environment-agnostic (either account and/or region are tokens), this property 
will return an array with 2 tokens that will resolve at deploy-time to the first two availability
zones returned from CloudFormation's Fn::GetAZs intrinsic function."
"""
environment = cdk.Environment(
    account=boto3.client('sts').get_caller_identity().get('Account'),
    region=boto3.session.Session().region_name)

app = cdk.App()

# cdk-nag: Check for compliance with CDK best practices
#   https://github.com/cdklabs/cdk-nag
# Uncomment the following line to run the cdk-nag checks
Aspects.of(app).add(cdk_nag.AwsSolutionsChecks(verbose=True))

cdk_stack = WickrGenaiChatbotStack(
    app, 'WickrGenaiChatbot',
    description='Wickr IO integration with GenAI Chatbot',
    env=environment,
)

app.synth()
