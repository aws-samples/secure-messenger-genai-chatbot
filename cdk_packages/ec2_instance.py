#!/usr/bin/env python3

import os.path

from aws_cdk import (
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_ssm as ssm,
)
from aws_cdk.aws_s3_assets import Asset
from cdk_nag import NagSuppressions
from constructs import Construct

dirname = os.path.dirname(__file__)


class EC2Instance(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        self.ec2_instance_role = iam.Role(
            self, 'EC2 instance role',
            assumed_by=iam.ServicePrincipal('ec2.amazonaws.com'),
            description='Role for EC2 instance',
        )

        # add standard management policy
        self.ec2_instance_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name('AmazonSSMManagedInstanceCore'))

        # instance to run the Wickr IO Docker container
        self.ec2_instance = ec2.Instance(
            self, 'EC2 instance',
            instance_type=ec2.InstanceType('t2.medium'),
            machine_image=ec2.MachineImage.generic_linux({
                'eu-west-1': 'ami-0095aed963d3ed501',
                # Canonical, Ubuntu, 22.04 LTS, amd64 jammy image build on 2024-01-24
                'eu-west-2': 'ami-04d9351fa78a6efea',
                # Canonical, Ubuntu, 22.04 LTS, amd64 jammy image build on 2024-01-26
                'eu-central-1': 'ami-026c3177c9bd54288',
                # Canonical, Ubuntu, 22.04 LTS, amd64 jammy image build on 2024-04-11
            }),
            vpc=params.network.vpc,
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
            ),
            require_imdsv2=True,
            role=self.ec2_instance_role,
            block_devices=[
                ec2.BlockDevice(
                    device_name='/dev/sda1',
                    volume=ec2.BlockDeviceVolume.ebs(
                        10,
                        volume_type=ec2.EbsDeviceVolumeType.GP3,
                        encrypted=True
                    )
                )
            ],
        )

        # Upload script for starting Wickr IO at every reboot
        start_wickrio_script = Asset(
            self, 'asset Wickr IO start script',
            path=os.path.join(dirname, 'assets', 'start_wickrio.sh')
        )
        start_wickrio_script.grant_read(self.ec2_instance_role)
        ssm.StringParameter(
            self, 'Wickr IO start script',
            parameter_name='/Wickr-GenAI-Chatbot/wickr-io-start-script',
            string_value=start_wickrio_script.s3_object_url,
        ).grant_read(self.ec2_instance_role)

        # Instance startup script (UserData)
        self.ec2_instance.user_data.add_commands(
            open(os.path.join(os.path.dirname(__file__), 'assets', 'setup.sh')).read()
        )

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions(
            construct=self.ec2_instance_role,
            suppressions=[
                {
                    'id': 'AwsSolutions-IAM4',
                    'reason': 'We are using recommended AWS managed policies for AWS Systems Manager: '
                              'https://aws.amazon.com/blogs/mt/applying-managed-instance-policy-best-practices/.',
                    'appliesTo': ['Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonSSMManagedInstanceCore'],
                },
            ],
            apply_to_children=True,
        )

        NagSuppressions.add_resource_suppressions(
            construct=self.ec2_instance,
            suppressions=[
                {
                    'id': 'AwsSolutions-EC28',
                    'reason': 'Detailed monitoring for EC2 instance/AutoScaling not required. This is only a '
                              'demonstration EC2 instance.',
                },
                {
                    'id': 'AwsSolutions-EC29',
                    'reason': 'ASG and has Termination Protection are not required.  This is only a '
                              'demonstration EC2 instance.',
                },
            ],
            apply_to_children=True,
        )
