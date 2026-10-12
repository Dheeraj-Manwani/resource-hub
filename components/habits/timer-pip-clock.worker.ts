// Only wake the PiP renderer once a second. All session state and elapsed-time
// calculations stay in the tab; terminating this worker cannot alter a timer.
setInterval(() => globalThis.postMessage(null), 1000)

export {}
