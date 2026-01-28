/*
 * PisoWiFi NodeMCU ESP Firmware
 * 
 * Features:
 * - Access Point Mode for initial setup
 * - Captive Portal for configuration
 * - WiFi Scanning to auto-fill SSID
 * - Key-based authentication for secure communication
 * - Multi-coin slot support with GPIO interrupts
 * - HTTP API for communication with main system
 * 
 * Hardware Requirements:
 * - NodeMCU ESP8266 or ESP32
 * - Coin acceptors connected to GPIO pins
 * - 5V power supply
 * 
 * GPIO Pin Mapping (ESP8266):
 * - D0 (GPIO 16) - Coin Slot 1
 * - D1 (GPIO 5)  - Coin Slot 2  
 * - D2 (GPIO 4)  - Coin Slot 3
 * - D5 (GPIO 14) - Coin Slot 4
 * - D6 (GPIO 12) - Status LED (optional)
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include <EEPROM.h>

// Configuration structure
struct Config {
  char ssid[32];
  char password[32];
  char authenticationKey[64];
  bool configured;
  int coinPins[4];
  int denominations[4];
  bool slotEnabled[4];
};

// Global variables
Config config;
ESP8266WebServer server(80);
DNSServer dnsServer;
const byte DNS_PORT = 53;

// Default configuration
const char* defaultSSID = "PisoWiFi-Setup";
const char* defaultPassword = "";
const int defaultCoinPins[4] = {16, 5, 4, 14}; // D0, D1, D2, D5
const int defaultDenominations[4] = {1, 5, 10, 1};
const bool defaultSlotEnabled[4] = {true, true, false, false};

// Coin detection variables
volatile bool coinDetected[4] = {false, false, false, false};
unsigned long lastInterruptTime[4] = {0, 0, 0, 0};
const unsigned long debounceDelay = 200; // 200ms debounce

// EEPROM addresses
#define CONFIG_ADDR 0
#define CONFIG_SIZE sizeof(Config)

void setup() {
  Serial.begin(115200);
  Serial.println("\n[PisoWiFi NodeMCU] Starting...");

  // Initialize EEPROM
  EEPROM.begin(512);
  
  // Load configuration
  loadConfig();
  
  // Initialize GPIO pins
  initGPIO();
  
  // Start in AP mode if not configured
  if (!config.configured) {
    startAccessPoint();
    startCaptivePortal();
  } else {
    connectToWiFi();
  }
  
  // Start HTTP server
  startHTTPServer();
  
  Serial.println("[PisoWiFi NodeMCU] Ready!");
}

void loop() {
  // Handle DNS requests for captive portal
  if (!config.configured) {
    dnsServer.processNextRequest();
  }
  
  // Handle HTTP requests
  server.handleClient();
  
  // Process coin detections
  processCoinDetections();
  
  // Reconnect to WiFi if disconnected
  if (config.configured && WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
    delay(5000);
  }
}

// Load configuration from EEPROM
void loadConfig() {
  EEPROM.get(CONFIG_ADDR, config);
  
  // Check if configuration is valid
  if (config.configured) {
    Serial.println("[Config] Loaded existing configuration");
    Serial.printf("[Config] SSID: %s\n", config.ssid);
    Serial.printf("[Config] Key: %s\n", config.authenticationKey);
  } else {
    Serial.println("[Config] No configuration found, using defaults");
    // Initialize with defaults
    strncpy(config.ssid, "", sizeof(config.ssid));
    strncpy(config.password, "", sizeof(config.password));
    strncpy(config.authenticationKey, "", sizeof(config.authenticationKey));
    config.configured = false;
    
    for (int i = 0; i < 4; i++) {
      config.coinPins[i] = defaultCoinPins[i];
      config.denominations[i] = defaultDenominations[i];
      config.slotEnabled[i] = defaultSlotEnabled[i];
    }
    
    saveConfig();
  }
}

// Save configuration to EEPROM
void saveConfig() {
  EEPROM.put(CONFIG_ADDR, config);
  EEPROM.commit();
  Serial.println("[Config] Configuration saved to EEPROM");
}

// Initialize GPIO pins
void initGPIO() {
  for (int i = 0; i < 4; i++) {
    if (config.slotEnabled[i]) {
      pinMode(config.coinPins[i], INPUT_PULLUP);
      attachInterrupt(digitalPinToInterrupt(config.coinPins[i]), 
                      coinInterrupt, FALLING);
      Serial.printf("[GPIO] Slot %d enabled on pin %d (denomination: %d)\n", 
                    i + 1, config.coinPins[i], config.denominations[i]);
    }
  }
  
  // Status LED
  pinMode(12, OUTPUT); // D6
  digitalWrite(12, LOW);
}

// Start Access Point mode
void startAccessPoint() {
  Serial.println("[WiFi] Starting Access Point...");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(defaultSSID, defaultPassword);
  
  IPAddress IP = WiFi.softAPIP();
  Serial.print("[WiFi] AP IP address: ");
  Serial.println(IP);
}

// Connect to configured WiFi network
void connectToWiFi() {
  Serial.printf("[WiFi] Connecting to %s...\n", config.ssid);
  
  WiFi.mode(WIFI_STA);
  if (strlen(config.password) > 0) {
    WiFi.begin(config.ssid, config.password);
  } else {
    WiFi.begin(config.ssid);
  }
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.print("[WiFi] IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Connection failed, reverting to AP mode");
    config.configured = false;
    saveConfig();
    startAccessPoint();
    startCaptivePortal();
  }
}

// Start captive portal
void startCaptivePortal() {
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
  Serial.println("[Portal] Captive portal started");
}

// Start HTTP server
void startHTTPServer() {
  // Root page - captive portal or status
  server.on("/", HTTP_GET, handleRoot);
  
  // WiFi scan endpoint
  server.on("/scan", HTTP_GET, handleWiFiScan);
  
  // Configuration endpoints
  server.on("/config", HTTP_GET, handleGetConfig);
  server.on("/config", HTTP_POST, handleSetConfig);
  
  // Coin detection endpoints
  server.on("/coin", HTTP_GET, handleCoinDetection);
  server.on("/coins", HTTP_GET, handleGetCoins);
  
  // Device information
  server.on("/info", HTTP_GET, handleDeviceInfo);
  
  // Reboot device
  server.on("/reboot", HTTP_POST, handleReboot);
  
  // Reset configuration
  server.on("/reset", HTTP_POST, handleResetConfig);
  
  server.begin();
  Serial.println("[HTTP] Server started");
}

// Handler functions
void handleRoot() {
  String page = createWebPage();
  server.send(200, "text/html", page);
}

String createWebPage() {
  String page = FPSTR(R"(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PisoWiFi NodeMCU Setup</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f0f0f0; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
        button { background: #007cba; color: white; padding: 12px 20px; border: none; border-radius: 5px; cursor: pointer; width: 100%; font-size: 16px; }
        button:hover { background: #005a87; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .hidden { display: none; }
        .slot-config { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .slot-header { font-weight: bold; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📡 PisoWiFi NodeMCU Setup</h1>
        <div id="status"></div>
        
        <form id="configForm">
            <div class="form-group">
                <label for="ssid">WiFi Network (SSID):</label>
                <input type="text" id="ssid" name="ssid" required>
                <button type="button" onclick="scanWiFi()">🔍 Scan Networks</button>
                <div id="networkList"></div>
            </div>
            
            <div class="form-group">
                <label for="password">WiFi Password (leave empty for open networks):</label>
                <input type="password" id="password" name="password">
            </div>
            
            <div class="form-group">
                <label for="authKey">Authentication Key:</label>
                <input type="text" id="authKey" name="authKey" required placeholder="Enter your PisoWiFi system key">
            </div>
            
            <h3>Coin Slot Configuration</h3>
            <div id="slotConfig"></div>
            
            <button type="submit">💾 Save Configuration</button>
        </form>
        
        <hr>
        <h3>Device Information</h3>
        <div id="deviceInfo"></div>
        <button onclick="getDeviceInfo()">🔄 Refresh Info</button>
        <button onclick="resetConfig()" style="background: #dc3545;">🗑️ Reset Configuration</button>
        <button onclick="rebootDevice()" style="background: #ffc107; color: black;">🔄 Reboot Device</button>
    </div>

    <script>
        // Load current configuration
        window.onload = function() {
            loadConfig();
            getDeviceInfo();
            createSlotConfig();
        };

        function createSlotConfig() {
            const container = document.getElementById('slotConfig');
            container.innerHTML = '';
            
            for (let i = 0; i < 4; i++) {
                const slotDiv = document.createElement('div');
                slotDiv.className = 'slot-config';
                slotDiv.innerHTML = `
                    <div class="slot-header">Slot ${i + 1}</div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="slot${i}Enabled" name="slot${i}Enabled"> Enable Slot
                        </label>
                    </div>
                    <div class="form-group">
                        <label for="slot${i}Pin">GPIO Pin:</label>
                        <select id="slot${i}Pin" name="slot${i}Pin">
                            <option value="16">D0 (GPIO 16)</option>
                            <option value="5">D1 (GPIO 5)</option>
                            <option value="4">D2 (GPIO 4)</option>
                            <option value="14">D5 (GPIO 14)</option>
                            <option value="12">D6 (GPIO 12)</option>
                            <option value="13">D7 (GPIO 13)</option>
                            <option value="0">D3 (GPIO 0)</option>
                            <option value="2">D4 (GPIO 2)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="slot${i}Denom">Denomination (Pesos):</label>
                        <select id="slot${i}Denom" name="slot${i}Denom">
                            <option value="1">1 Peso</option>
                            <option value="5">5 Pesos</option>
                            <option value="10">10 Pesos</option>
                        </select>
                    </div>
                `;
                container.appendChild(slotDiv);
            }
        }

        function scanWiFi() {
            const status = document.getElementById('status');
            status.innerHTML = '<div class="info">Scanning for networks...</div>';
            
            fetch('/scan')
                .then(response => response.json())
                .then(data => {
                    const networkList = document.getElementById('networkList');
                    networkList.innerHTML = '<h4>Available Networks:</h4>';
                    
                    data.networks.forEach(network => {
                        const div = document.createElement('div');
                        div.innerHTML = `
                            <button type="button" onclick="selectNetwork('${network.ssid}')">
                                ${network.ssid} (${network.rssi}dBm) ${network.encrypted ? '🔒' : '🔓'}
                            </button>
                        `;
                        networkList.appendChild(div);
                    });
                    
                    status.innerHTML = '';
                })
                .catch(error => {
                    status.innerHTML = `<div class="error">Error scanning networks: ${error.message}</div>`;
                });
        }

        function selectNetwork(ssid) {
            document.getElementById('ssid').value = ssid;
            document.getElementById('networkList').innerHTML = '';
        }

        function loadConfig() {
            fetch('/config')
                .then(response => response.json())
                .then(data => {
                    if (data.configured) {
                        document.getElementById('ssid').value = data.ssid || '';
                        document.getElementById('authKey').value = data.authenticationKey || '';
                        
                        // Load slot configurations
                        for (let i = 0; i < 4; i++) {
                            if (data.slotEnabled && data.slotEnabled[i] !== undefined) {
                                document.getElementById(`slot${i}Enabled`).checked = data.slotEnabled[i];
                            }
                            if (data.coinPins && data.coinPins[i] !== undefined) {
                                document.getElementById(`slot${i}Pin`).value = data.coinPins[i];
                            }
                            if (data.denominations && data.denominations[i] !== undefined) {
                                document.getElementById(`slot${i}Denom`).value = data.denominations[i];
                            }
                        }
                    }
                })
                .catch(error => console.error('Error loading config:', error));
        }

        function getDeviceInfo() {
            fetch('/info')
                .then(response => response.json())
                .then(data => {
                    const infoDiv = document.getElementById('deviceInfo');
                    infoDiv.innerHTML = `
                        <p><strong>MAC Address:</strong> ${data.mac}</p>
                        <p><strong>IP Address:</strong> ${data.ip}</p>
                        <p><strong>Chip ID:</strong> ${data.chipId}</p>
                        <p><strong>Free Heap:</strong> ${data.freeHeap} bytes</p>
                        <p><strong>Uptime:</strong> ${data.uptime} seconds</p>
                        <p><strong>Configured:</strong> ${data.configured ? 'Yes' : 'No'}</p>
                    `;
                })
                .catch(error => console.error('Error getting device info:', error));
        }

        document.getElementById('configForm').onsubmit = function(e) {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const config = {
                ssid: formData.get('ssid'),
                password: formData.get('password'),
                authenticationKey: formData.get('authKey'),
                coinPins: [],
                denominations: [],
                slotEnabled: []
            };
            
            // Collect slot configurations
            for (let i = 0; i < 4; i++) {
                config.coinPins.push(parseInt(document.getElementById(`slot${i}Pin`).value));
                config.denominations.push(parseInt(document.getElementById(`slot${i}Denom`).value));
                config.slotEnabled.push(document.getElementById(`slot${i}Enabled`).checked);
            }
            
            const status = document.getElementById('status');
            status.innerHTML = '<div class="info">Saving configuration...</div>';
            
            fetch('/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    status.innerHTML = '<div class="success">Configuration saved successfully! Device will reboot...</div>';
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                } else {
                    status.innerHTML = `<div class="error">Error: ${data.error}</div>`;
                }
            })
            .catch(error => {
                status.innerHTML = `<div class="error">Error saving configuration: ${error.message}</div>`;
            });
        };

        function resetConfig() {
            if (confirm('Are you sure you want to reset the configuration?')) {
                fetch('/reset', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            alert('Configuration reset. Device will reboot.');
                            location.reload();
                        }
                    });
            }
        }

        function rebootDevice() {
            if (confirm('Are you sure you want to reboot the device?')) {
                fetch('/reboot', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            alert('Device rebooting...');
                        }
                    });
            }
        }
    </script>
</body>
</html>
)");

  return page;
}

void handleWiFiScan() {
  Serial.println("[HTTP] WiFi scan requested");
  
  int n = WiFi.scanNetworks();
  DynamicJsonDocument doc(2048);
  JsonArray networks = doc.createNestedArray("networks");
  
  for (int i = 0; i < n; i++) {
    JsonObject network = networks.createNestedObject();
    network["ssid"] = WiFi.SSID(i);
    network["rssi"] = WiFi.RSSI(i);
    network["encrypted"] = WiFi.encryptionType(i) != ENC_TYPE_NONE;
  }
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleGetConfig() {
  DynamicJsonDocument doc(1024);
  doc["configured"] = config.configured;
  doc["ssid"] = config.ssid;
  doc["authenticationKey"] = config.authenticationKey;
  
  JsonArray coinPins = doc.createNestedArray("coinPins");
  JsonArray denominations = doc.createNestedArray("denominations");
  JsonArray slotEnabled = doc.createNestedArray("slotEnabled");
  
  for (int i = 0; i < 4; i++) {
    coinPins.add(config.coinPins[i]);
    denominations.add(config.denominations[i]);
    slotEnabled.add(config.slotEnabled[i]);
  }
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleSetConfig() {
  if (server.hasArg("plain") == false) {
    server.send(400, "application/json", "{\"error\":\"No data received\"}");
    return;
  }
  
  String json = server.arg("plain");
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, json);
  
  if (error) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  // Validate authentication key
  const char* authKey = doc["authenticationKey"];
  if (!authKey || strlen(authKey) == 0) {
    server.send(400, "application/json", "{\"error\":\"Authentication key required\"}");
    return;
  }
  
  // Update configuration
  strncpy(config.ssid, doc["ssid"] | "", sizeof(config.ssid) - 1);
  strncpy(config.password, doc["password"] | "", sizeof(config.password) - 1);
  strncpy(config.authenticationKey, authKey, sizeof(config.authenticationKey) - 1);
  config.configured = true;
  
  // Update coin slot configuration
  JsonArray coinPins = doc["coinPins"];
  JsonArray denominations = doc["denominations"];
  JsonArray slotEnabled = doc["slotEnabled"];
  
  for (int i = 0; i < 4 && i < coinPins.size(); i++) {
    config.coinPins[i] = coinPins[i];
    config.denominations[i] = denominations[i];
    config.slotEnabled[i] = slotEnabled[i];
  }
  
  saveConfig();
  
  // Reinitialize GPIO
  initGPIO();
  
  server.send(200, "application/json", "{\"success\":true}");
  
  // Reboot after a delay
  delay(1000);
  ESP.restart();
}

void handleCoinDetection() {
  int slot = server.arg("slot").toInt();
  int denomination = server.arg("denomination").toInt();
  
  if (slot < 1 || slot > 4 || denomination <= 0) {
    server.send(400, "application/json", "{\"error\":\"Invalid parameters\"}");
    return;
  }
  
  // Simulate coin detection for testing
  coinDetected[slot - 1] = true;
  
  Serial.printf("[Coin] Detected %d peso coin in slot %d\n", denomination, slot);
  
  server.send(200, "application/json", "{\"success\":true}");
}

void handleGetCoins() {
  DynamicJsonDocument doc(512);
  JsonArray coins = doc.createNestedArray("coins");
  
  for (int i = 0; i < 4; i++) {
    if (coinDetected[i]) {
      JsonObject coin = coins.createNestedObject();
      coin["slot"] = i + 1;
      coin["denomination"] = config.denominations[i];
      coin["timestamp"] = millis();
      coinDetected[i] = false; // Clear detection flag
    }
  }
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleDeviceInfo() {
  DynamicJsonDocument doc(512);
  doc["mac"] = WiFi.macAddress();
  doc["ip"] = WiFi.localIP().toString();
  doc["chipId"] = ESP.getChipId();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = millis() / 1000;
  doc["configured"] = config.configured;
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleReboot() {
  server.send(200, "application/json", "{\"success\":true}");
  delay(1000);
  ESP.restart();
}

void handleResetConfig() {
  // Reset configuration to defaults
  strncpy(config.ssid, "", sizeof(config.ssid));
  strncpy(config.password, "", sizeof(config.password));
  strncpy(config.authenticationKey, "", sizeof(config.authenticationKey));
  config.configured = false;
  
  for (int i = 0; i < 4; i++) {
    config.coinPins[i] = defaultCoinPins[i];
    config.denominations[i] = defaultDenominations[i];
    config.slotEnabled[i] = defaultSlotEnabled[i];
  }
  
  saveConfig();
  server.send(200, "application/json", "{\"success\":true}");
  
  // Reboot after a delay
  delay(1000);
  ESP.restart();
}

// Coin detection interrupt service routine
void coinInterrupt() {
  // This function is called by the interrupt, but we'll process in main loop
  // to avoid issues with Serial.print in ISR
  for (int i = 0; i < 4; i++) {
    if (config.slotEnabled[i] && digitalRead(config.coinPins[i]) == LOW) {
      unsigned long now = millis();
      if (now - lastInterruptTime[i] > debounceDelay) {
        coinDetected[i] = true;
        lastInterruptTime[i] = now;
        Serial.printf("[Coin] Slot %d triggered (denomination: %d)\n", i + 1, config.denominations[i]);
      }
    }
  }
}

// Process coin detections in main loop
void processCoinDetections() {
  for (int i = 0; i < 4; i++) {
    if (coinDetected[i] && config.slotEnabled[i]) {
      // Send coin detection to main system if configured
      if (config.configured && WiFi.status() == WL_CONNECTED) {
        sendCoinDetection(i + 1, config.denominations[i]);
      }
      coinDetected[i] = false;
    }
  }
}

// Send coin detection to main system
void sendCoinDetection(int slot, int denomination) {
  if (!config.configured) return;
  
  HTTPClient http;
  String url = "http://" + WiFi.localIP().toString() + ":3000/api/nodemcu/coin";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(256);
  doc["macAddress"] = WiFi.macAddress();
  doc["slot"] = slot;
  doc["denomination"] = denomination;
  doc["authenticationKey"] = config.authenticationKey;
  
  String json;
  serializeJson(doc, json);
  
  int httpResponseCode = http.POST(json);
  
  if (httpResponseCode > 0) {
    Serial.printf("[HTTP] Coin detection sent, response: %d\n", httpResponseCode);
  } else {
    Serial.printf("[HTTP] Error sending coin detection: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
}