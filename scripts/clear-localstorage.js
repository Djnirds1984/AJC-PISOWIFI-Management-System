// Script to clear all PisoWiFi-related localStorage items
// Run this in browser console or include in portal

(function() {
    console.log('[CLEANUP] Clearing PisoWiFi localStorage...');
    
    // Clear all PisoWiFi-related localStorage items
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('pisowifi') || key.includes('ajc') || key.includes('session'))) {
            keysToRemove.push(key);
        }
    }
    
    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`[CLEANUP] Removed: ${key}`);
    });
    
    console.log(`[CLEANUP] Cleared ${keysToRemove.length} localStorage items`);
    console.log('[CLEANUP] Session state reset - please refresh the page');
})();