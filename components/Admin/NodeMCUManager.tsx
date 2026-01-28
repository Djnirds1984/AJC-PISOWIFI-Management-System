import React, { useState, useEffect } from 'react';
import { NodeMCUDevice, Rate } from '../../types';
import { apiClient } from '../../lib/api';

interface NodeMCUManagerProps {
  devices: NodeMCUDevice[];
  onUpdateDevices: (devices: NodeMCUDevice[]) => void;
}

const NodeMCUManager: React.FC<NodeMCUManagerProps> = ({ devices, onUpdateDevices }) => {
  const [localDevices, setLocalDevices] = useState<NodeMCUDevice[]>(devices);
  const [selectedDevice, setSelectedDevice] = useState<NodeMCUDevice | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setLocalDevices(devices);
  }, [devices]);

  const handleDownloadFirmware = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/firmware/nodemcu', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to download firmware');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NodeMCU_ESP8266.ino';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('Firmware downloaded successfully!');
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download firmware. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAcceptDevice = async (deviceId: string) => {
    try {
      await apiClient.acceptNodeMCUDevice(deviceId);
      
      const updatedDevices = localDevices.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'accepted' as const } 
          : device
      );
      
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to accept NodeMCU device:', error);
      alert('Failed to accept NodeMCU device');
    }
  };

  const handleRejectDevice = async (deviceId: string) => {
    try {
      await apiClient.rejectNodeMCUDevice(deviceId);
      
      const updatedDevices = localDevices.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'rejected' as const } 
          : device
      );
      
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to reject NodeMCU device:', error);
      alert('Failed to reject NodeMCU device');
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await apiClient.removeNodeMCUDevice(deviceId);
      
      const updatedDevices = localDevices.filter(device => device.id !== deviceId);
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to remove NodeMCU device:', error);
      alert('Failed to remove NodeMCU device');
    }
  };

  const handleUpdateRates = async (deviceId: string, rates: Rate[]) => {
    try {
      await apiClient.updateNodeMCURates(deviceId, rates);
      
      const updatedDevices = localDevices.map(device => 
        device.id === deviceId 
          ? { ...device, rates } 
          : device
      );
      
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to update NodeMCU rates:', error);
      alert('Failed to update NodeMCU rates');
    }
  };

  const pendingDevices = localDevices.filter(device => device.status === 'pending');
  const acceptedDevices = localDevices.filter(device => device.status === 'accepted');

  return (
    <div className="space-y-6">
      {/* Firmware Download Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-blue-800 mb-1">NodeMCU ESP8266 Firmware</h3>
            <p className="text-sm text-blue-600">Download the latest firmware for your NodeMCU devices</p>
          </div>
          <button
            onClick={handleDownloadFirmware}
            disabled={isDownloading}
            className={`px-6 py-3 rounded-xl font-bold text-white transition-all ${
              isDownloading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
            }`}
          >
            {isDownloading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downloading...
              </span>
            ) : (
              <span className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download Firmware
              </span>
            )}
          </button>
        </div>
        <div className="mt-4 text-xs text-blue-500">
          <p>• Compatible with NodeMCU ESP8266 modules</p>
          <p>• Requires Arduino IDE with ESP8266 board support</p>
          <p>• See README for flashing instructions</p>
        </div>
      </div>

      {/* Pending Devices Section */}
      {pendingDevices.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-yellow-800 mb-4">Pending NodeMCU Connections</h3>
          <div className="space-y-3">
            {pendingDevices.map(device => (
              <div key={device.id} className="bg-white rounded-xl border border-yellow-100 p-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-gray-800">{device.name}</div>
                  <div className="text-sm text-gray-600">
                    IP: {device.ipAddress} | MAC: {device.macAddress} | Last seen: {new Date(device.lastSeen).toLocaleString()}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleAcceptDevice(device.id)}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Accept
                  </button>
                  <button 
                    onClick={() => handleRejectDevice(device.id)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted Devices Section */}
      {acceptedDevices.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-green-800 mb-4">Accepted NodeMCU Devices</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MAC Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Pulses</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {acceptedDevices.map(device => (
                  <tr key={device.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{device.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.ipAddress}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.macAddress}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{new Date(device.lastSeen).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.totalPulses}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">₱{device.totalRevenue.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button 
                        onClick={() => setSelectedDevice(device)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Configure
                      </button>
                      <button 
                        onClick={() => handleRemoveDevice(device.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">Configure {selectedDevice.name}</h3>
                <button 
                  onClick={() => setSelectedDevice(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Device Name</label>
                <input
                  type="text"
                  value={selectedDevice.name}
                  onChange={(e) => {
                    const updatedDevice = { ...selectedDevice, name: e.target.value };
                    setSelectedDevice(updatedDevice);
                  }}
                  className="w-full p-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pricing Configuration</label>
                <div className="space-y-2">
                  {selectedDevice.rates.map((rate, index) => (
                    <div key={index} className="flex space-x-2">
                      <input
                        type="number"
                        value={rate.pesos}
                        onChange={(e) => {
                          const updatedRates = [...selectedDevice.rates];
                          updatedRates[index].pesos = Number(e.target.value);
                          const updatedDevice = { ...selectedDevice, rates: updatedRates };
                          setSelectedDevice(updatedDevice);
                        }}
                        className="flex-1 p-2 border border-gray-300 rounded-lg"
                        placeholder="Pesos"
                      />
                      <input
                        type="number"
                        value={rate.minutes}
                        onChange={(e) => {
                          const updatedRates = [...selectedDevice.rates];
                          updatedRates[index].minutes = Number(e.target.value);
                          const updatedDevice = { ...selectedDevice, rates: updatedRates };
                          setSelectedDevice(updatedDevice);
                        }}
                        className="flex-1 p-2 border border-gray-300 rounded-lg"
                        placeholder="Minutes"
                      />
                      <button
                        onClick={() => {
                          const updatedRates = selectedDevice.rates.filter((_, i) => i !== index);
                          const updatedDevice = { ...selectedDevice, rates: updatedRates };
                          setSelectedDevice(updatedDevice);
                        }}
                        className="px-3 py-2 bg-red-500 text-white rounded-lg"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const newRate: Rate = { id: Date.now().toString(), pesos: 1, minutes: 1 };
                    const updatedDevice = { ...selectedDevice, rates: [...selectedDevice.rates, newRate] };
                    setSelectedDevice(updatedDevice);
                  }}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg"
                >
                  Add Rate
                </button>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    handleUpdateRates(selectedDevice.id, selectedDevice.rates);
                    setSelectedDevice(null);
                  }}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg"
                >
                  Save Configuration
                </button>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Devices Message */}
      {localDevices.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-gray-600">No NodeMCU devices connected yet.</p>
          <p className="text-sm text-gray-500 mt-2">Connect your NodeMCU boards to the network with the correct authentication key.</p>
        </div>
      )}
    </div>
  );
};

export default NodeMCUManager;