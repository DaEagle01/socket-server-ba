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
            const otherPartyId = currentCall.from === socket.id ? currentCall.to : currentCall.from;
            const otherParty = users[otherPartyId];

            if (otherParty) {
                otherParty.socket.emit('hangUpCall');
            }

            // If the agent hangs up, remove the customer from the users object
            if (users[socket.id].userType === 'agent') {
                const customerId = currentCall.from;
                if (customerId) {
                    console.log(`Removing customer ${customerId} from users`);
                    delete users[customerId];
                }
            }

            currentCall = null;
        }
    });

    /* 
    hangs up the call when either agent or customer hangs up the call

    socket.on('hangUpCall', () => {
    console.log('Call hung up by user:', socket.id);

    if (currentCall && (currentCall.from === socket.id || users[socket.id].userType === 'agent')) {
        const otherPartyId = currentCall.from === socket.id ? currentCall.to : currentCall.from;
        const otherParty = users[otherPartyId];

        // Notify the other party that the call has been hung up
        if (otherParty) {
            otherParty.socket.emit('hangUpCall');
        }

        // Remove customer from users after hanging up
        if (users[currentCall.from]) {
            delete users[currentCall.from];
            console.log(`User ${currentCall.from} removed from users object`);
        }

        // Clear the current call
        currentCall = null;

        // Process the next call in the queue
        processNextCall();
    }
});

    */

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
