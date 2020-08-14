#!/bin/bash

cd ../docker && \
docker build -t watutor/openvidu-call-react:$1 --no-cache . && \
docker push watutor/openvidu-call-react:$1 && \
cd ../openvidu-call-react && \
ssh -i test-openvidu.pem ubuntu@ec2-34-215-106-69.us-west-2.compute.amazonaws.com