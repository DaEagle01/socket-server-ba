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

// Object to track connected users (customers and agents)
const users = {};

// Server-side queue structure
let callQueue = [];  // Array of customer objects
let agents = {};  // Store agent connection statuses

// io.on('connection', (socket) => {
//     // Register agent and customer with the socket connection
//     socket.on('register', ({ userType, agentId }) => {
//         if (userType === 'agent') {
//             agents[agentId] = { socketId: socket.id, busy: false };
//         }
//     });

//     // Handle new customer incoming call
//     socket.on('customerCall', (customerDetails) => {
//         const { customerId, roomId } = customerDetails;

//         // Add customer to the queue
//         callQueue.push({ customerId, roomId, socketId: socket.id, status: 'waiting' });

//         // Notify the customer about their queue position
//         updateCustomerQueuePositions();

//         // Attempt to connect the customer to an available agent
//         assignCustomerToAgent();
//     });

//     // Handle agent ending a call
//     socket.on('agentEndCall', (agentId) => {
//         agents[agentId].busy = false;
//         assignCustomerToAgent();  // Assign the next customer in the queue
//     });

//     // Handle customer hang-up (removing customer from the queue)
//     socket.on('customerHangUp', (customerId) => {
//         callQueue = callQueue.filter(c => c.customerId !== customerId);
//         updateCustomerQueuePositions();
//     });

//     // Function to update customers in the queue about their positions
//     const updateCustomerQueuePositions = () => {
//         callQueue.forEach((customer, index) => {
//             const position = index + 1;
//             io.to(customer.socketId).emit('queuePosition', { position });
//         });
//     };

//     // Assign a waiting customer to an available agent
//     const assignCustomerToAgent = () => {
//         const availableAgent = Object.keys(agents).find(agentId => !agents[agentId].busy);
//         if (availableAgent && callQueue.length > 0) {
//             const nextCustomer = callQueue.shift(); // Get the first customer in the queue
//             agents[availableAgent].busy = true;  // Mark agent as busy
//             io.to(agents[availableAgent].socketId).emit('incomingCall', nextCustomer);  // Send call details to agent
//             io.to(nextCustomer.socketId).emit('connected', { agentId: availableAgent });  // Notify customer they are connected
//             updateCustomerQueuePositions();  // Update positions for remaining customers
//         }
//     };
// });

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user registration as customer or agent
    socket.on('register', ({ userType }) => {
        users[socket.id] = { socket, userType };
        console.log(`User registered: ${socket.id}, Type: ${userType}`);
        console.log('Current users:', Object.values(users).map(user => ({ id: user.socket.id, type: user.userType })));
    });

    socket.on('callUser', (data) => {
        console.log('Call initiated by user:', socket.id);
        console.log('Current users:', Object.values(users).map(user => ({ id: user.socket.id, type: user.userType })));

        // Find an available agent
        const agent = Object.values(users).find(user => user.userType === 'agent');

        if (agent) {
            console.log('Emitting incoming call to agent:', agent.socket.id);
            // Emit to the specific agent to show incoming call
            agent.socket.emit('incomingCall', { signal: data, from: socket.id });
        } else {
            console.log('No agent available.');
            socket.emit('noAgentAvailable');
        }
    });

    socket.on('acceptCall', (data) => {
        console.log('Call accepted by agent:', socket.id);
        // Find the customer who initiated the call
        const customer = users[data.to];
        if (customer) {
            console.log('Emitting call accepted to customer:', customer.socket.id);
            customer.socket.emit('callAccepted', data.signal);
        }
    });

    socket.on('rejectCall', (data) => {
        console.log('Call rejected by agent:', socket.id);
        // Notify the customer who initiated the call
        const customer = users[data.to];
        if (customer) {
            console.log('Emitting call rejected to customer:', customer.socket.id);
            customer.socket.emit('callRejected');
        }
    });

    // Handle hang up event
    socket.on('hangUpCall', () => {
        console.log('Call hung up by user:', socket.id);
        const user = users[socket.id];
        if (user) {
            // Find the other party involved in the call
            const otherParty = Object.values(users).find(usr => usr.socket.id !== socket.id && usr.userType !== user.userType);
            if (otherParty) {
                console.log(`Notifying other party ${otherParty.socket.id} to hang up the call.`);
                // Send some payload if needed
                otherParty.socket.emit('hangUpCall', { reason: 'User disconnected', callId: 'unique-call-id' }); // Example payload
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete users[socket.id]; // Remove the disconnected user from the map

        // Notify the other party if there's an ongoing call
        const otherParty = Object.values(users).find(usr => usr.socket.id !== socket.id);
        if (otherParty) {
            console.log(`Notifying other party ${otherParty.socket.id} to hang up the call due to disconnection.`);
            otherParty.socket.emit('hangUpCall');
        }
    });
});

server.listen(3001, () => {
    console.log('Signaling server listening on *:3001');
});
