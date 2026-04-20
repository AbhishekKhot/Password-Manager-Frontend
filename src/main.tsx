import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * Application entry point.
 *
 * Use case:
 *   Mounts <App /> into the #root element in index.html. Vite bundles from
 *   this file by default.
 *
 * Why `<StrictMode>`:
 *   A dev-only React feature that:
 *     - Double-invokes component render, effect setup, and state updaters
 *       so we notice side-effects in places that should be pure.
 *     - Surfaces deprecated API usage at render time.
 *   StrictMode has zero cost in production — React strips it.
 *
 * Why the non-null assertion `!` on getElementById:
 *   index.html is committed alongside this file and guaranteed to contain
 *   a `<div id="root">`. React cannot mount into `null`, so if someone
 *   ever removes the div we want to fail loudly (via TypeError) rather
 *   than silently render to nothing.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
