// @refresh reset // Fixes hot refresh errors in development https://github.com/ianstormtaylor/slate/issues/3477
import { withYHistory, withYjs, YjsEditor } from '@slate-yjs/core';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { BaseEditor, createEditor, Descendant } from 'slate';
import { HistoryEditor } from 'slate-history';
import { Editable, ReactEditor, Slate, withReact } from 'slate-react';
import * as Y from 'yjs';

import { CustomElement } from './CustomElement';
import { CustomLeaf, CustomText } from './CustomLeaf';
import { EditorToolbar } from './EditorToolbar';
import { handleHotkeys } from './helpers';

// Slate suggests overwriting the module to include the ReactEditor, Custom Elements & Text
// https://docs.slatejs.org/concepts/12-typescript
declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

interface EditorProps {
  initialValue?: Descendant[];
  placeholder?: string;
  noteId: string;
}

export const Editor: React.FC<EditorProps> = ({
  initialValue = [],
  placeholder,
  noteId,
}) => {
  const [value, setValue] = useState<Array<Descendant>>([]);
  const [yDoc, setYDoc] = useState<Y.Doc>();
  const renderElement = useCallback(
    (props) => <CustomElement {...props} />,
    []
  );
  const ws = useWebSocket(`ws://localhost:3001/api/sync/${noteId}`);
  const renderLeaf = useCallback((props) => <CustomLeaf {...props} />, []);

  // Create a yjs document and get the shared type
  const sharedType = useMemo(() => {
    const doc = new Y.Doc();
    doc.on("update", (update) => {
      ws.sendMessage(update);
    });
    // Create empty ydoc
    const sharedType = doc.get("content", Y.XmlText) as Y.XmlText;
    setYDoc(doc);
    return sharedType;
  }, []);

  useEffect(() => {
    (async () => {
      if (!yDoc) return;
      if (!ws?.lastMessage?.data) return;
      Y.applyUpdate(
        yDoc,
        new Uint8Array(await (ws?.lastMessage?.data as Blob).arrayBuffer())
      );
    })();
  }, [ws.lastMessage]);

  const editor = useMemo(
    () => withYHistory(withYjs(withReact(createEditor()), sharedType)),
    []
  );

  // Connect editor in useEffect to comply with concurrent mode requirements.
  useEffect(() => {
    YjsEditor.connect(editor);
    return () => YjsEditor.disconnect(editor);
  }, [editor]);

  return (
    <Slate editor={editor} value={value} onChange={(value) => setValue(value)}>
      <EditorToolbar />
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        placeholder={placeholder}
        onKeyDown={handleHotkeys(editor)}
        // The dev server injects extra values to the editr and the console complains
        // so we override them here to remove the message
        autoCapitalize="false"
        autoCorrect="false"
        spellCheck="false"
      />
    </Slate>
  );
};
