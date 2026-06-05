// Make React available globally for JSX test files in the node environment.
// Vite 8 / vitest 3 with the rolldown pipeline may not inject the automatic
// JSX runtime for test files; this global polyfill keeps tests simple.
import * as React from 'react';
globalThis.React = React;
