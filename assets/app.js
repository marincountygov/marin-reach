// App-specific behavior only. vendor/marinos/marinos.js owns the shared
// components, menus, dialogs, routing, and #app-status-message infrastructure.
// Both scripts are deferred, with the shell loaded before this script.
// Keep component hosts in the initial HTML; shell v1 initializes once.
//
// Add application state, data loading, calculations, and workflow interactions
// here. Do not reimplement the shared shell or edit vendor/marinos/.

document.addEventListener('DOMContentLoaded', () => {
  // Start the app-specific workflow here. The shell's initial setup is complete.
});
