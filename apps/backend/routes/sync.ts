import { slateNodesToInsertDelta } from '@slate-yjs/core';
import express from 'express';
import { WebsocketRequestHandler } from 'express-ws';
import * as WebSocketType from 'ws';
import * as Y from 'yjs';

import * as Notes from '../fixtures/notes';

const notes: { [k: string]: Notes.Note } = { ...Notes };

// Patch `express.Router` to support `.ws()` without needing to pass around a `ws`-ified app.
// https://github.com/HenningM/express-ws/issues/86
// eslint-disable-next-line @typescript-eslint/no-var-requires
const patch = require("express-ws/lib/add-ws-method");
patch.default(express.Router);

const router = express.Router();

/**
 * Maintain an array of websocket clients connected to a particular note.
 */
const clients: { [k: string]: WebSocketType[] } = {};

/**
 * Maintain an array of Y.Doc, one Y.Doc for each note.
 * This is used to keep notes currently being edited in memory
 * It's created from the notes fixtures when someone connects to a note for the first time
 * When all websocket clients are disconnected, the corresponding array item is deleted.
 */
const masterDocs: { [k: string]: Y.Doc } = {};

const syncHandler: WebsocketRequestHandler = (ws, req) => {
  const noteId = req.params.id;
  console.log("Client connected");
  if (!clients[noteId]) {
    clients[noteId] = [ws];
  } else {
    clients[noteId].push(ws);
  }

  if (masterDocs[noteId]) {
    const doc = masterDocs[noteId];
    ws.send(Y.encodeStateAsUpdate(doc));
  } else {
    // Find the correct note
    let note = null;
    for (const i in notes) {
      if (notes[i].id === noteId) {
        note = notes[i];
        break;
      }
    }
    if (!note) return;

    // Create a new YDoc instance
    const doc = new Y.Doc();
    masterDocs[noteId] = doc;
    const sharedType = doc.get("content", Y.XmlText) as Y.XmlText;

    // Convert note contents to yjs datatype and store it in ydoc.
    sharedType.applyDelta(slateNodesToInsertDelta(note.content));

    // send the encoded ydoc to client
    ws.send(Y.encodeStateAsUpdate(doc));
  }

  ws.on("message", (data) => {
    console.log("Data received");

    // Merge data using yjs and broadcast to all clients.
    const doc = masterDocs[noteId];
    Y.applyUpdate(doc, new Uint8Array(data as ArrayBufferLike));

    // Send update to all clients with the new doc
    clients[noteId].forEach((client) => {
      client.send(Y.encodeStateAsUpdate(doc));
    });
  });

  ws.on("open", function () {});

  ws.on("close", function () {
    console.log("Client disconnected");
    clients[noteId] = clients[noteId].filter((client) => client !== ws);
    if (!clients[noteId].length) {
      console.log("All clients disconnected. Deleting masterDoc");
      delete masterDocs[noteId];
    }
  });
};

router.ws("/:id", syncHandler);

export default router;
