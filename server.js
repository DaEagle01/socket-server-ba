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

    socket.on('register', ({ userType }) => {
        users[socket.id] = { socket, userType };
        console.log(`User registered: ${socket.id}, Type: ${userType}`);
    });

    socket.on('callUser', (data) => {
        console.log('Call initiated by user:', socket.id);
        const agent = Object.values(users).find(user => user.userType === 'agent');

        if (agent && !currentCall) {
            currentCall = { from: socket.id, data };
            agent.socket.emit('incomingCall', { signal: data, from: socket.id });
        } else {
            const queuePosition = callQueue.length + 1;
            callQueue.push({ from: socket.id, data });
            socket.emit('inQueue', { position: queuePosition });
            updateQueuePositions();
        }
    });

    socket.on('acceptCall', (data) => {
        console.log('Call accepted by agent:', socket.id);
        const customer = users[currentCall.from];
        if (customer) {
            customer.socket.emit('callAccepted', data.signal);
        }
    });

    socket.on('rejectCall', () => {
        console.log('Call rejected by agent:', socket.id);
        if (currentCall) {
            const customer = users[currentCall.from];
            if (customer) {
                customer.socket.emit('callRejected');
            }
            processNextCall();
        }
    });

    socket.on('requestNextCall', () => {
        processNextCall(socket.id);
    });

    socket.on('hangUpCall', () => {
        console.log('Call hung up by user:', socket.id);
        if (currentCall && (currentCall.from === socket.id || users[socket.id].userType === 'agent')) {
            const otherParty = users[currentCall.from === socket.id ? currentCall.to : currentCall.from];
            if (otherParty) {
                otherParty.socket.emit('hangUpCall');
            }
            currentCall = null;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentCall && currentCall.from === socket.id) {
            processNextCall();
        } else {
            const queueIndex = callQueue.findIndex(call => call.from === socket.id);
            if (queueIndex !== -1) {
                callQueue.splice(queueIndex, 1);
                updateQueuePositions();
            }
        }
        delete users[socket.id];
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
