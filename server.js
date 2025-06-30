// import WebSocket, { WebSocketServer } from 'ws';

// const PORT = 8080;
// const wss = new WebSocketServer({ port: PORT });
// // const WebSocket = require('ws');

// const PORT = process.env.PORT || 8080;
// const wss = new WebSocket.Server({ port: PORT });

const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 8080;


let roomMembers = new Map();;
let allMembersIn = {};
let allAdminIn = {};

let roomMembersImg = new Map(); // roomKey -> [ws clients]
let roomAdmins = new Map();  // roomKey -> admin ws

console.log(`WebSocket server is running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userName = null;

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return ws.send(JSON.stringify({ type: "sending_er",error: 'Invalid JSON format' }));
    }

    let name = data.name;
    let roomKey = data.roomKey;
    let ImgPro = data.ImgPro;
    switch (data.type) {
      case 'join': {
        if (!name || !roomKey || !ImgPro) {
          ws.send(JSON.stringify({ type: 'error2', error: 'Name, image or Room Key required' }));
          return;
        }
        userName = name;
        currentRoom = roomKey;

        if (!roomMembers.has(roomKey)) {
        //   First person becomes admin
          roomMembers.set(roomKey, [ws]);
          roomAdmins.set(roomKey, ws);
          roomMembersImg.set(roomKey, new Map());
          roomMembersImg.get(roomKey).set(name, ImgPro);
          if (
            (allMembersIn[roomKey] && allMembersIn[roomKey].includes(name)) ||
            (Array.isArray(allAdminIn[roomKey]) && allAdminIn[roomKey].includes(name)) ||
            allAdminIn[roomKey] === name 
          ) {
            ws.close(4007, "This name alredy exssit");
            return;
          }
          if (!allAdminIn[roomKey]) {
            allAdminIn[roomKey] = [];
          }

          if (!allAdminIn[roomKey].includes(name)) {
            allAdminIn[roomKey].push(name);
          }

          ws.send(JSON.stringify({ type: 'system', message: " You are the admin." }));
          // ws.send(JSON.stringify({ type: 'role', role: 'admin' }));

          let message = null;
          let exceptWs = null
          notifyRoom(currentRoom, message, exceptWs)
        } else {
          ws.send(JSON.stringify({ type: "room_ex", error: 'Room already exists. Use "Request to Join"' }));
        }
        break;
      }

      case 'request': {
        let ImgPro = data.ImgPro;
        if (!name || !roomKey) {
            ws.send(JSON.stringify({ error: 'Name and Room Key required' }));
            return;
          }
          if (!name || !roomKey || !ImgPro) {
              ws.send(JSON.stringify({ error: 'Name and Room Key required' }));
              return;
            }
        let room4 = roomMembers.get(data.roomKey); // Set of WebSocket clients (or similar)
        let room5 = roomAdmins.get(data.roomKey);  // Admin object with a name property
        // console.warn(room4);
        // Only run name check if either room4 or room5 exists
        if (room4 || room5) {
            let nameTaken = false;

            // Check in room members (room4)
            if (room4) {
                for (const client of room4) {
                    if (client.name == data.name) {
                        nameTaken = true;
                        break;
                    }
                }
            }

            // Check in room admin (room5)
            if (room5 == data.name) {
                nameTaken = true;
            }

            // Send error if name is taken
            if (nameTaken) {
                ws.send(JSON.stringify({
                    type: 'error1',
                    message: 'This name already exists in the room.'
                }));
                return;
            }
        }
        userName = name;
        currentRoom = roomKey;

        const adminWs = roomAdmins.get(roomKey);
        if (adminWs && adminWs.readyState === WebSocket.OPEN) {
          ws._pendingJoin = { name, roomKey, ImgPro};
          adminWs.send(JSON.stringify({ type: 'join-request', name, roomKey, ImgPro }));
        } else {
          ws.send(JSON.stringify({ type: 'join-declined', reason: 'Room not available or admin offline' }));
        }
        break;
      }

      case 'join-response': {
        const { approve, name, roomKey, ImgPro } = data;

        const client = [...wss.clients].find(
          c => c._pendingJoin?.name === name && c._pendingJoin?.roomKey === roomKey
        );

        if (!client) return;

        if (approve) {
          if (!roomMembers.has(roomKey)) roomMembers.set(roomKey, []  );
          roomMembers.get(roomKey).push(client);
          roomMembersImg.get(roomKey).set(name, ImgPro);
              if (
                (allMembersIn[roomKey] && allMembersIn[roomKey].includes(name)) ||
                (Array.isArray(allAdminIn[roomKey]) && allAdminIn[roomKey].includes(name)) ||
                allAdminIn[roomKey] === name 
              ) {
                client.close(4007, "Your name is duplicated! try another name");
                return;
              }
          if (!allMembersIn[roomKey]) {
            allMembersIn[roomKey] = [];
          }
          if (!allMembersIn[roomKey].includes(name)) {
            allMembersIn[roomKey].push(name);
          }
          client.send(JSON.stringify({ type: 'join-approved', roomKey }));
          notifyRoom(roomKey, `${name} has joined the room.`);
          delete client._pendingJoin;
        } else {
          client.send(JSON.stringify({ type: 'join-declined', reason: 'Admin declined your request' }));
          client.close(4000, "Admin declined your request");
        }
        break;
      }

      case 'message': {
        if (!currentRoom || !userName) {
          ws.send(JSON.stringify({ error: 'You are not in a room' }));
          return;
        }
        const message = data.message?.trim();
        const time =  data.time || new Date();;
        if (!message) return;

        const clients = roomMembers.get(currentRoom) || [];
        const userImageBase64 = roomMembersImg.get(currentRoom)?.get(userName) || null;
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'message',
              sender: userName,
              message, 
              image: userImageBase64,
              time: time
            }));
          }
        }
        break;
      }
      case 'message2': {
        if (!currentRoom || !userName) {
          ws.send(JSON.stringify({ error: 'You are not in a room' }));
          return;
        }
        let images2 = [];
        if (Array.isArray(data.images)) {
          images2 = data.images;
        } else if (typeof data.images === "string") {
          images2.push(data.images);
        }
        const message = data.message?.trim();
        const time =  data.time || new Date();;
        if (!message) return;

        const clients = roomMembers.get(currentRoom) || [];
        const userImageBase64 = roomMembersImg.get(currentRoom)?.get(userName) || null;
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'message2',
              sender: userName,
              message, 
              image: userImageBase64,
              time: time, 
              images: images2
            }));
          }
        }
        break;
      }case 'delete': {
        let adminman = roomAdmins.get(roomKey);
        let yourkey = data.youroomkey;
        let yourname = data.name;
        if(adminman == yourname){
          roomMembers.delete(yourkey);           
          roomMembersImg.delete(yourkey);       
          roomAdmins.delete(yourkey);         
          delete allMembersIn[yourkey];       
          delete allAdminIn[yourkey]; 
          client.close(4006, "Closed the room");
        }else{

          const currentMembers = roomMembers.get(yourkey) || [];
          const filtered = currentMembers.filter(c => c !== ws);
          roomMembers.set(yourkey, filtered);

          if (allMembersIn[yourkey]) {
            allMembersIn[yourkey] = allMembersIn[yourkey].filter(name => name !== yourname);
          }

          if (roomMembersImg.has(yourkey)) {
            roomMembersImg.get(yourkey).delete(yourname);
          }

          if (roomAdmins.get(yourkey) === ws) {
            roomAdmins.delete(yourkey);
          }

          ws.close(4001, "You left the room");
          notifyRoom(yourkey, yourname);

        }
       
      }

      default:
        ws.send(JSON.stringify({ error: `Unsupported message type: ${data.type}` }));
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const members = roomMembers.get(currentRoom) || [];
      const filtered = members.filter(c => c !== ws);
      roomMembers.set(currentRoom, filtered);

      if (roomAdmins.get(currentRoom) === ws) {
        console.log(`Admin of room ${currentRoom} disconnected. Removing room.`);
        roomAdmins.delete(currentRoom);
      }

      if (filtered.length === 0) {
        roomMembers.delete(currentRoom);
      }
    }
  });

});

function notifyRoom(currentRoom1, message = null, exceptWs = null) {
  let members = roomMembers.get(currentRoom1) || [];
  let members1 = allMembersIn[currentRoom1] || [];
  let adminWs = allAdminIn[currentRoom1] || [];
  let allMembers = [];
    for (const memberName of members1) {
    allMembers.push({
        name: memberName || "Unknown",
        tag: "member",
    });
    }

  if (adminWs) {
    allMembers.push({
      name: adminWs,
      tag: "admin"
    });
  }
  members.forEach(client => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      if(message != null){
        client.send(JSON.stringify({ type: 'system', message }));
      // }else if(){};
      }
      client.send(JSON.stringify({
        type: 'system_members',
        members: allMembers
      }));
    }
  });
}
