import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Loader } from "@googlemaps/js-api-loader";
import lodash from 'lodash-es';
import config from '../config';
import readXlsxFile from 'read-excel-file';

// Import the Excel file directly
import excelFile from '../../data/Transacciones_small.xlsx';

const BusRouteHeatmap = () => {
  const [map, setMap] = useState(null);
  const [heatmapLayer, setHeatmapLayer] = useState(null);
  const [displayMode, setDisplayMode] = useState('on');
  const [google, setGoogle] = useState(null);
  const [busStops, setBusStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      console.log('Loading data...');
      try {
        // Read the Excel file
        const response = await fetch(excelFile);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const rows = await readXlsxFile(blob);

        // Get headers (first row)
        const headers = rows[0];
        
        // Convert rows to objects with headers as keys
        const data = rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });

        // Process the transactions
        const transactions = data.map(row => ({
          section: parseInt(row.Seccion),
          tipo: parseInt(row['Tipo Trx']),
          latitude: parseFloat(String(row.Latitud).replace(',', '.')),
          longitude: parseFloat(String(row.Longitud).replace(',', '.'))
        })).filter(row => !isNaN(row.section) && !isNaN(row.tipo));

        // Group by section and calculate statistics
        const sectionStats = lodash.groupBy(transactions, 'section');
        const processedStops = Object.entries(sectionStats).map(([section, records]) => {
          const boardingCount = records.filter(t => t.tipo === 627).length;
          const alightingCount = records.filter(t => t.tipo === 624).length;
          const sampleLocation = records[0];

          return {
            section: parseInt(section),
            position: {
              lat: sampleLocation.longitude, // Note: coordinates are swapped in the data
              lng: sampleLocation.latitude
            },
            name: `Section ${section}`,
            passengersOn: boardingCount,
            passengersOff: alightingCount
          };
        }).sort((a, b) => a.section - b.section);

        console.log('Processed stops:', processedStops);
        setBusStops(processedStops);
        setError(null);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load bus route data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const initMap = async () => {
      if (!busStops.length) return;

      try {
        const loader = new Loader({
          apiKey: config.googleMapsApiKey,
          version: "weekly",
          libraries: ["visualization"]
        });

        const googleInstance = await loader.load();
        await googleInstance.maps.importLibrary("visualization");
        setGoogle(googleInstance);

        const mapElement = document.getElementById('map');
        if (!mapElement) {
          console.error('Map element not found');
          return;
        }

        // Calculate center point from data
        const center = busStops[0].position;
        
        const mapInstance = new googleInstance.maps.Map(mapElement, {
          center: center,
          zoom: 13,
          mapId: config.mapId,
          streetViewControl: false,
          zoomControl: true,
          mapTypeControl: false,
        });

        setMap(mapInstance);

        // Create route between stops
        const directionsService = new googleInstance.maps.DirectionsService();
        const directionsRenderer = new googleInstance.maps.DirectionsRenderer({
          map: mapInstance,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 3
          }
        });

        const waypoints = busStops.slice(1, -1).map(stop => ({
          location: new googleInstance.maps.LatLng(stop.position.lat, stop.position.lng),
          stopover: true
        }));

        const request = {
          origin: new googleInstance.maps.LatLng(busStops[0].position.lat, busStops[0].position.lng),
          destination: new googleInstance.maps.LatLng(busStops[busStops.length - 1].position.lat, busStops[busStops.length - 1].position.lng),
          waypoints: waypoints,
          travelMode: googleInstance.maps.TravelMode.DRIVING,
          optimizeWaypoints: false
        };

        directionsService.route(request, (result, status) => {
          if (status === 'OK') {
            directionsRenderer.setDirections(result);
          } else {
            console.error('Directions request failed:', status);
          }
        });

        // Create heatmap
        const heatmap = new googleInstance.maps.visualization.HeatmapLayer({
          data: busStops.map(stop => ({
            location: new googleInstance.maps.LatLng(stop.position.lat, stop.position.lng),
            weight: stop.passengersOn
          })),
          map: mapInstance,
          radius: 60,
          opacity: 0.7
        });

        setHeatmapLayer(heatmap);

        // Add markers
        busStops.forEach(stop => {
          const marker = new googleInstance.maps.Marker({
            map: mapInstance,
            position: stop.position,
            title: `Section ${stop.section}`,
            icon: {
              path: googleInstance.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#2563eb',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2
            }
          });

          marker.addListener('click', () => {
            const infoContent = document.createElement('div');
            infoContent.innerHTML = `
              <div style="padding: 10px">
                <h3 style="font-weight: bold; margin-bottom: 8px; color: #1a1a1a">Section ${stop.section}</h3>
                <p style="margin: 4px 0; color: #2563eb">Boarding: ${stop.passengersOn} passengers</p>
                <p style="margin: 4px 0; color: #2563eb">Alighting: ${stop.passengersOff} passengers</p>
              </div>
            `;
            
            const infoWindow = new googleInstance.maps.InfoWindow({
              content: infoContent
            });
            
            infoWindow.open({
              anchor: marker,
              map: mapInstance
            });
          });
        });

      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map. Please check your Google Maps API key.');
      }
    };

    initMap();
  }, [busStops]);

  useEffect(() => {
    if (heatmapLayer && map && google && busStops.length) {
      const newData = busStops.map(stop => ({
        location: new google.maps.LatLng(stop.position.lat, stop.position.lng),
        weight: displayMode === 'on' ? stop.passengersOn : stop.passengersOff
      }));
      heatmapLayer.setData(newData);
    }
  }, [displayMode, heatmapLayer, map, google, busStops]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-96">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-96 text-red-600">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full flex flex-col gap-4">
      <div className="flex flex-col">
        <CardHeader className="flex flex-col gap-4">
          <CardTitle className="mb-4">Mapa de calor - Buenos Aires - Pasajeros ascenso y descenso</CardTitle>
          <div className="flex flex-row gap-x-2">
            <button
              className={`px-4 py-2 rounded ${displayMode === 'on' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              onClick={() => setDisplayMode('on')}
            >
              Ascenso de pasajeros
            </button>
            <button
              className={`px-4 py-2 rounded ${displayMode === 'off' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              onClick={() => setDisplayMode('off')}
            >
              Descenso de pasajeros
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex-grow p-6">
          <div 
            id="map"
            className="w-full h-full"
            style={{ minHeight: '800px'}}
          />
        </CardContent>
      </div>
    </Card> 
  );
};

export default BusRouteHeatmap;