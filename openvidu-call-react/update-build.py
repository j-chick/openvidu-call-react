from os import system, popen
import re

tag = input("Enter new build tag: ")

print("Updating image tag in docker-compose.override.yml...")

docker_file = open("/opt/openvidu/docker-compose.override.yml", "r")
docker_file_content = docker_file.read()

with open("/opt/openvidu/docker-compose.override.yml", "w") as f:
    new_content = re.sub(r"        image: watutor/openvidu-call-react:.+", "        image: watutor/openvidu-call-react:" + tag, docker_file_content)
    f.write(new_content)

docker_file.close()

print("Stopping OpenVidu...")

system("cd /opt/openvidu && ./openvidu stop")

prev_image = popen("docker images watutor/openvidu-call-react -q").read()

print("Current image ID: " + prev_image)

print("Deleting image " + prev_image + "...")

system("docker rmi -f " + prev_image)

print("Starting OpenVidu...")

system("cd /opt/openvidu && ./openvidu start")
