# BUILDING
#
#   docker build -t oh-ledger -f main/docker/Dockerfile .
#
#   -> build from root of this source (cd ../.. from here)  
#
# RUNNING
#
#   docker run --rm --name oh-ledger -p 8090:8090 oh-ledger 
#
#   -> map to 0.0.0.0:8090 so localhost 8090 works for running tests against container
#   -> if running in VirtualBox (docker-machine) ensure to port forward port 8090 in the docker-machine VM ('default')
#   -> if using docker-machine, make sure to stop machine before running node.js outside of docker:  `docker-machine stop`
#

FROM node:12.21.0

EXPOSE 8090

WORKDIR /home/node/app
COPY package.json /home/node/app/
COPY main/js /home/node/app/main/js/
COPY main/static /home/node/app/main/static/
COPY tools /home/node/app/tools/

ENV PORT 8090

RUN npm install

CMD ["npm", "run", "start"]
