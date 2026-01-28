/*
 * NodeMCU ESP8266 Firmware for PisoWiFi Multi-Coin Slot System
 * 
 * Features:
 * - Creates hotspot access point for initial setup
 * - Captive portal for configuration
 * - WiFi scanning to detect nearby PisoWiFi hotspots
 * - Authentication with system key
 * - Coin pulse detection on GPIO D6
 * 
 * Hardware:
 * - NodeMCU ESP8266
 * - Coin acceptor connected to GPIO D6
 * 
 * Version: 1.0
 * Author: PisoWiFi Team
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <DNSServer.h>
#include <EEPROM.h>

// EEPROM addresses
#define EEPROM_SSID_ADDR 0
#define EEPROM_KEY_ADDR 32
#define EEPROM_CONFIGURED_ADDR 64
#define EEPROM_DEVICE_ID_ADDR 65

// Default values
#define DEFAULT_AP_SSID "PisoWiFi-Setup"
#define DEFAULT_AP_PASSWORD ""
#define DEFAULT_DEVICE_ID "NODEMCU_DEFAULT"

// GPIO pin for coin detection
#define COIN_PIN D6

// Global variables
String configuredSSID = "";
String systemKey = "";
String deviceId = DEFAULT_DEVICE_ID;
bool isConfigured = false;

// Web server and DNS server
ESP8266WebServer server(80);
DNSServer dnsServer;
const byte DNS_PORT = 53;

// Function prototypes
void setupAccessPoint();
void setupCaptivePortal();
void handleRoot();
void handleScan();
void handleConfigure();
void handleCoinPulse();
void saveConfiguration();
void loadConfiguration();
void connectToPisoWiFi();
void sendCaptivePortal();

void setup() {
  Serial.begin(115200);
  Serial.println("Starting NodeMCU ESP8266 Firmware...");

  // Initialize EEPROM
  EEPROM.begin(512);

  // Load configuration from EEPROM
  loadConfiguration();

  // Set up coin detection pin
  pinMode(COIN_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(COIN_PIN), handleCoinPulse, FALLING);

  // If not configured, start access point
  if (!isConfigured) {
    Serial.println("Device not configured. Starting setup access point...");
    setupAccessPoint();
    setupCaptivePortal();
  } else {
    Serial.println("Device configured. Connecting to PisoWiFi network...");
    connectToPisoWiFi();
  }
}

void loop() {
  if (!isConfigured) {
    dnsServer.processNextRequest();
  }
  server.handleClient();
  
  // Handle reconnection if needed
  if (isConfigured && WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    connectToPisoWiFi();
    delay(5000);
  }
}

// Set up access point for initial configuration
void setupAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(DEFAULT_AP_SSID, DEFAULT_AP_PASSWORD);
  Serial.println("Access Point started:");
  Serial.print("SSID: ");
  Serial.println(DEFAULT_AP_SSID);
  Serial.print("IP Address: ");
  Serial.println(WiFi.softAPIP());
}

// Set up captive portal
void setupCaptivePortal() {
  // Set up DNS server for captive portal
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  // Set up web server routes
  server.on("/", handleRoot);
  server.on("/scan", handleScan);
  server.on("/configure", handleConfigure);
  server.on("/generate_204", handleRoot);  // Android captive portal check
  server.on("/hotspot-detect.html", handleRoot);  // iOS captive portal check
  server.onNotFound(handleRoot);

  server.begin();
  Serial.println("Captive portal started");
}

// Handle root page (captive portal)
void handleRoot() {
  String html = R"=====(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PisoWiFi NodeMCU Setup</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f0f0f0; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
        button { background-color: #007cba; color: white; padding: 12px 20px; border: none; border-radius: 5px; cursor: pointer; width: 100%; font-size: 16px; }
        button:hover { background-color: #005a8a; }
        .scan-btn { background-color: #28a745; margin-bottom: 15px; }
        .scan-btn:hover { background-color: #218838; }
        .network-list { max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 15px; }
        .network-item { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; }
        .network-item:hover { background-color: #f5f5f5; }
        .network-item:last-child { border-bottom: none; }
        .status { padding: 10px; border-radius: 5px; margin-top: 15px; text-align: center; }
        .success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📡 PisoWiFi NodeMCU Setup</h1>
        <div class="form-group">
            <button class="scan-btn" onclick="scanNetworks()">🔍 Scan for PisoWiFi Networks</button>
            <div id="networkList" class="network-list" style="display: none;"></div>
        </div>
        <form id="configForm">
            <div class="form-group">
                <label for="ssid">PisoWiFi Network SSID:</label>
                <input type="text" id="ssid" name="ssid" required placeholder="Enter PisoWiFi network name">
            </div>
            <div class="form-group">
                <label for="key">System Authentication Key:</label>
                <input type="password" id="key" name="key" required placeholder="Enter system key">
            </div>
            <div class="form-group">
                <label for="deviceId">Device ID (Optional):</label>
                <input type="text" id="deviceId" name="deviceId" placeholder="Unique identifier for this device">
            </div>
            <button type="submit">💾 Save Configuration</button>
        </form>
        <div id="status"></div>
    </div>

    <script>
        function scanNetworks() {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '<div class="status">Scanning for networks...</div>';
            
            fetch('/scan')
                .then(response => response.json())
                .then(data => {
                    const networkList = document.getElementById('networkList');
                    networkList.style.display = 'block';
                    networkList.innerHTML = '<h3>Available Networks:</h3>';
                    
                    data.networks.forEach(network => {
                        const networkItem = document.createElement('div');
                        networkItem.className = 'network-item';
                        networkItem.innerHTML = `<strong>${network.ssid}</strong> (${network.rssi} dBm)`;
                        networkItem.onclick = () => {
                            document.getElementById('ssid').value = network.ssid;
                            networkList.style.display = 'none';
                        };
                        networkList.appendChild(networkItem);
                    });
                    
                    statusDiv.innerHTML = '';
                })
                .catch(error => {
                    statusDiv.innerHTML = '<div class="status error">Error scanning networks: ' + error.message + '</div>';
                });
        }

        document.getElementById('configForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '<div class="status">Saving configuration...</div>';
            
            fetch('/configure', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statusDiv.innerHTML = '<div class="status success">Configuration saved successfully! Device will restart and connect to the network.</div>';
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                } else {
                    statusDiv.innerHTML = '<div class="status error">Error: ' + data.message + '</div>';
                }
            })
            .catch(error => {
                statusDiv.innerHTML = '<div class="status error">Error saving configuration: ' + error.message + '</div>';
            });
        });
    </script>
</body>
</html>
)=====";
  server.send(200, "text/html", html);
}

// Handle WiFi network scan
void handleScan() {
  Serial.println("Scanning for networks...");
  
  int n = WiFi.scanNetworks();
  String json = "{\"networks\":[";
  
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + WiFi.RSSI(i) + "}";
  }
  
  json += "]}";
  
  server.send(200, "application/json", json);
  Serial.println("Network scan complete");
}

// Handle configuration save
void handleConfigure() {
  if (server.hasArg("ssid") && server.hasArg("key")) {
    configuredSSID = server.arg("ssid");
    systemKey = server.arg("key");
    
    if (server.hasArg("deviceId") && server.arg("deviceId").length() > 0) {
      deviceId = server.arg("deviceId");
    }
    
    saveConfiguration();
    
    String response = "{\"success\":true,\"message\":\"Configuration saved successfully\"}";
    server.send(200, "application/json", response);
    
    Serial.println("Configuration saved:");
    Serial.print("SSID: ");
    Serial.println(configuredSSID);
    Serial.print("Device ID: ");
    Serial.println(deviceId);
    Serial.println("Restarting in 3 seconds...");
    
    delay(3000);
    ESP.restart();
  } else {
    String response = "{\"success\":false,\"message\":\"Missing required parameters\"}";
    server.send(400, "application/json", response);
  }
}

// Handle coin pulse detection
void ICACHE_RAM_ATTR handleCoinPulse() {
  static unsigned long lastInterruptTime = 0;
  unsigned long interruptTime = millis();
  
  // Debounce - ignore interrupts too close together
  if (interruptTime - lastInterruptTime > 200) {
    Serial.println("Coin detected!");
    
    if (isConfigured && WiFi.status() == WL_CONNECTED) {
      // Send coin detection to PisoWiFi system
      sendCoinDetection();
    }
    
    lastInterruptTime = interruptTime;
  }
}

// Send coin detection to PisoWiFi system
void sendCoinDetection() {
  HTTPClient http;
  WiFiClient client;
  
  String url = "http://" + WiFi.gatewayIP().toString() + "/api/nodemcu/coin";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  
  String payload = "{\"deviceId\":\"" + deviceId + "\",\"key\":\"" + systemKey + "\"}";
  
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Coin detection sent successfully");
  } else {
    Serial.print("Error sending coin detection: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
}

// Save configuration to EEPROM
void saveConfiguration() {
  // Save SSID
  for (int i = 0; i < configuredSSID.length() && i < 32; i++) {
    EEPROM.write(EEPROM_SSID_ADDR + i, configuredSSID[i]);
  }
  EEPROM.write(EEPROM_SSID_ADDR + min(configuredSSID.length(), 31), '\0');
  
  // Save system key
  for (int i = 0; i < systemKey.length() && i < 32; i++) {
    EEPROM.write(EEPROM_KEY_ADDR + i, systemKey[i]);
  }
  EEPROM.write(EEPROM_KEY_ADDR + min(systemKey.length(), 31), '\0');
  
  // Save device ID
  for (int i = 0; i < deviceId.length() && i < 32; i++) {
    EEPROM.write(EEPROM_DEVICE_ID_ADDR + i, deviceId[i]);
  }
  EEPROM.write(EEPROM_DEVICE_ID_ADDR + min(deviceId.length(), 31), '\0');
  
  // Mark as configured
  EEPROM.write(EEPROM_CONFIGURED_ADDR, 1);
  
  EEPROM.commit();
  isConfigured = true;
}

// Load configuration from EEPROM
void loadConfiguration() {
  // Check if configured
  isConfigured = (EEPROM.read(EEPROM_CONFIGURED_ADDR) == 1);
  
  if (isConfigured) {
    // Load SSID
    char ssid[32];
    for (int i = 0; i < 32; i++) {
      ssid[i] = EEPROM.read(EEPROM_SSID_ADDR + i);
      if (ssid[i] == '\0') break;
    }
    configuredSSID = String(ssid);
    
    // Load system key
    char key[32];
    for (int i = 0; i < 32; i++) {
      key[i] = EEPROM.read(EEPROM_KEY_ADDR + i);
      if (key[i] == '\0') break;
    }
    systemKey = String(key);
    
    // Load device ID
    char id[32];
    for (int i = 0; i < 32; i++) {
      id[i] = EEPROM.read(EEPROM_DEVICE_ID_ADDR + i);
      if (id[i] == '\0') break;
    }
    deviceId = String(id);
    
    Serial.println("Configuration loaded:");
    Serial.print("SSID: ");
    Serial.println(configuredSSID);
    Serial.print("Device ID: ");
    Serial.println(deviceId);
  }
}

// Connect to configured PisoWiFi network
void connectToPisoWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(configuredSSID.c_str());
  
  Serial.print("Connecting to ");
  Serial.println(configuredSSID);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    
    // Set up web server for coin detection endpoint
    server.on("/coin", HTTP_POST, []() {
      if (server.hasArg("deviceId") && server.hasArg("key")) {
        String receivedDeviceId = server.arg("deviceId");
        String receivedKey = server.arg("key");
        
        if (receivedDeviceId == deviceId && receivedKey == systemKey) {
          Serial.println("Coin detection authenticated");
          server.send(200, "application/json", "{\"success\":true}");
        } else {
          Serial.println("Coin detection authentication failed");
          server.send(401, "application/json", "{\"success\":false,\"message\":\"Authentication failed\"}");
        }
      } else {
        server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing parameters\"}");
      }
    });
    
    server.begin();
    Serial.println("Coin detection endpoint started");
  } else {
    Serial.println("");
    Serial.println("Failed to connect to WiFi");
    // Restart to go back to setup mode
    ESP.restart();
  }
}