import { mount } from 'svelte';
import DeckEditorApp from './DeckEditorApp.svelte';
import { McpDeckEditorBridge } from './lib/bridge';

const target = document.getElementById('app');
if (!target) {
  throw new Error('App mount target was not found.');
}

mount(DeckEditorApp, {
  target,
  props: {
    bridge: new McpDeckEditorBridge(),
  },
});
