#!/usr/bin/env python3

import requests

import aws_cdk as cdk
from aws_cdk import (
    aws_ec2 as ec2,
)
from cdk_nag import NagSuppressions
from constructs import Construct


class SSHEnablement(Construct):

    def __init__(self, scope: Construct, construct_id: str, params=None):
        super().__init__(scope, construct_id)

        # create security group rule for inbound SSH but no outbound rule
        ssh_sg = ec2.SecurityGroup(
            self, "SSH security group",
            vpc=params.network.vpc,
            description="SSH security group",
        )
        # add ingress rule to allow traffic from IPv4 CIDR
        if self.node.try_get_context('allow_ingress_cidr'):
            ingress_cider = self.node.try_get_context('allow_ingress_cidr')
        else:
            ingress_cider = '0.0.0.0/0'
            data = requests.get('https://ipinfo.io/json', verify=True, timeout=10).json()
            print(f'\nYou are allowing SSH from the public internet (CIDR: {ingress_cider}) to the Wickr IO '
                  f'EC2 instance. Consider limiting the access from your public IP address.\n'
                  f'Your public IP address is {data["ip"]}. To limit SSH access from this address, run cdk deploy with '
                  f'--context allow_ingress_cidr="{data["ip"]}/32".\n')
        ssh_sg.add_ingress_rule(ec2.Peer.ipv4(ingress_cider), ec2.Port.tcp(22), 'Allow ssh access to ec2 instances')

        # add security group to EC2 instance
        params.wickrio_instance.ec2_instance.add_security_group(ssh_sg)

        # add SSH key to EC2 instance
        params.wickrio_instance.ec2_instance.instance.add_property_override('KeyName', 'ec2-ssh-access-eu-west-1')

        # ----------------------------------------------------------------
        #       cdk_nag suppressions
        # ----------------------------------------------------------------

        NagSuppressions.add_resource_suppressions_by_path(
            cdk.Stack.of(self),
            path=f'{ssh_sg.to_string()}/Resource',
            suppressions=[
                {
                    'id': 'AwsSolutions-EC23',
                    'reason': 'Access from public internet is required for SSH access to EC2 instances.',
                },
            ],
            apply_to_children=True,
        )
