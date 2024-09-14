const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
        preflightContinue: false,
        optionsSuccessStatus: 204
    }
});

const users = {};
const callQueue = [];
let currentCall = null;

io.on('connection', (socket) => {
    console.log('A user connected...', socket.id);
    console.log("users: ", Object.keys(users));
    console.log("callQueue: ", callQueue);
    console.log("currentCall: ", { roomId: currentCall?.from, socketId: currentCall?.socketId });

    socket.on('register', ({ userType, roomId }) => {
        users[roomId] = { socket, userType, socketId: socket.id };
        console.log(`User registered: ${roomId}, Type: ${userType}`);
    });

    socket.on('callUser', (data) => {
        console.log('Call initiated by user:', data?.roomId, data?.kycDetails?.data?.first_name, data?.kycDetails?.data?.last_name);
        console.log("currentCall: ", { roomId: currentCall?.from, socketId: currentCall?.socketId });
        const agent = Object.values(users).find(user => user.userType === 'agent');

        if (agent && !currentCall) {
            currentCall = { from: data?.roomId, data, socketId: socket.id };
            agent.socket.emit('incomingCall', { signal: data, from: data?.roomId });
        } else {
            const queuePosition = callQueue.length + 1;
            callQueue.push({ from: data?.roomId, data, socketId: socket.id });
            socket.emit('inQueue', { position: queuePosition });
            updateQueuePositions();
        }
    });

    socket.on('acceptCall', (data) => {
        console.log('Call accepted by agent:', data?.to);
        const customer = users[currentCall.from];
        if (customer) {
            customer.socket.emit('callAccepted', data.signal);
        }
    });

    socket.on('rejectCall', (data) => {
        console.log('Call rejected by agent:', data);
        if (currentCall) {
            const customer = users[currentCall.from];
            if (customer) {
                customer.socket.emit('callRejected');
            }
            // if there are no more calls in the queue, and the agent rejects the call, set currentCall to null
            if(!callQueue.length) {
                currentCall = null;
            }
        }
        processNextCall(data?.from);
    });

    socket.on('requestNextCall', ({ from, to }) => {
        console.log({ from, to })
        processNextCall(from);
    });

    socket.on('hangUpCall', (data) => {
        console.log('user given hangUp data and current call', data, 324243524134564);
        console.log("currentCall: ", { roomId: currentCall?.from, socketId: currentCall?.socketId });

        if (currentCall && (currentCall.from === data?.from || currentCall.from === data?.to || users[data?.from].userType === 'agent')) {
            const otherParty = data?.by === "agent" ? users[data?.to] : users[data?.from];

            if (otherParty) {
                otherParty.socket.emit('hangUpCall', data);
            }

            // If the agent hangs up, remove the customer from the users object
            if (users[data?.from].userType === 'agent') {
                const customerId = currentCall.from;
                if (customerId) {
                    console.log(`Removing customer ${customerId} from users`);
                    delete users[customerId];
                }
            }

            currentCall = null;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentCall && currentCall?.socketId === socket.id) {
            processNextCall();
            currentCall = null;
        } else {
            const userKeys = Object.keys(users);
            const matchingUser = userKeys.find(key => users[key].socketId === socket.id);
            console.log({ matchingUser }, users[matchingUser]?.userType === 'agent');
            if (users[matchingUser]?.userType === 'agent') {
                currentCall = null;
            };

            const queueIndex = callQueue.findIndex(call => call.socketId === socket.id);
            if (queueIndex !== -1) {
                callQueue.splice(queueIndex, 1);
                updateQueuePositions();
            }
        }
        // delete users[socket.id];
    });

    function processNextCall(agentId) {
        if (callQueue.length > 0) {
            currentCall = callQueue.shift();
            const agent = users[agentId];
            if (agent && agent.userType === 'agent') {
                agent.socket.emit('incomingCall', { signal: currentCall.data, from: currentCall.from });
            }
            updateQueuePositions();
        }
    }

    function updateQueuePositions() {
        callQueue.forEach((call, index) => {
            const customer = users[call.from];
            if (customer) {
                customer.socket.emit('queueUpdate', { position: index + 1 });
            }
        });
        const agent = Object.values(users).find(user => user.userType === 'agent');
        if (agent) {
            agent.socket.emit('queueUpdate', { queue: callQueue.map(call => ({ id: call.from, ...call.data })) });
        }
    }
});

server.listen(3001, () => {
    console.log('Signaling server listening on *:3001');
});
