import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Loader } from '@googlemaps/js-api-loader';
import config from '../config';
import '../index.css';

const busStops = [
  { position: { lat: -34.6037, lng: -58.3816 }, name: "Plaza de Mayo", passengersOn: 45, passengersOff: 30 },
  { position: { lat: -34.6051, lng: -58.3787 }, name: "Casa Rosada", passengersOn: 25, passengersOff: 15 },
  { position: { lat: -34.6083, lng: -58.3744 }, name: "Puerto Madero", passengersOn: 35, passengersOff: 40 },
  { position: { lat: -34.6037, lng: -58.3892 }, name: "Av. 9 de Julio", passengersOn: 50, passengersOff: 35 },
  { position: { lat: -34.6002, lng: -58.3833 }, name: "Teatro Colón", passengersOn: 30, passengersOff: 45 },
  { position: { lat: -34.6015, lng: -58.3860 }, name: "Lavalle", passengersOn: 40, passengersOff: 25 },
  { position: { lat: -34.6040, lng: -58.3810 }, name: "Corrientes", passengersOn: 55, passengersOff: 40 },
  { position: { lat: -34.6060, lng: -58.3795 }, name: "Diagonal Norte", passengersOn: 35, passengersOff: 30 },
  { position: { lat: -34.6075, lng: -58.3770 }, name: "Florida", passengersOn: 45, passengersOff: 35 },
  { position: { lat: -34.6090, lng: -58.3750 }, name: "Retiro", passengersOn: 60, passengersOff: 50 },
  { position: { lat: -34.6020, lng: -58.3830 }, name: "Obelisco", passengersOn: 65, passengersOff: 55 },
  { position: { lat: -34.6045, lng: -58.3800 }, name: "Congreso", passengersOn: 40, passengersOff: 35 },
  { position: { lat: -34.6070, lng: -58.3780 }, name: "Plaza San Martín", passengersOn: 30, passengersOff: 25 },
  { position: { lat: -34.6030, lng: -58.3850 }, name: "Once", passengersOn: 70, passengersOff: 60 },
  { position: { lat: -34.6065, lng: -58.3760 }, name: "Catalinas", passengersOn: 25, passengersOff: 20 },
  { position: { lat: -34.6010, lng: -58.3840 }, name: "Tribunales", passengersOn: 35, passengersOff: 30 },
  { position: { lat: -34.6080, lng: -58.3730 }, name: "Retiro Sur", passengersOn: 45, passengersOff: 40 },
  { position: { lat: -34.6025, lng: -58.3870 }, name: "Abasto", passengersOn: 55, passengersOff: 45 },
  { position: { lat: -34.6055, lng: -58.3785 }, name: "Microcentro", passengersOn: 50, passengersOff: 40 },
  { position: { lat: -34.6095, lng: -58.3740 }, name: "Dock Sud", passengersOn: 30, passengersOff: 25 }
];

const BusRouteHeatmap = () => {
  const [map, setMap] = useState(null);
  const [heatmapLayer, setHeatmapLayer] = useState(null);
  const [displayMode, setDisplayMode] = useState('on');
  const [google, setGoogle] = useState(null);

  useEffect(() => {
    const initMap = async () => {
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

        const mapInstance = new googleInstance.maps.Map(mapElement, {
          center: { lat: -34.6037, lng: -58.3816 },
          zoom: 15,
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
            title: stop.name,
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
                <h3 style="font-weight: bold; margin-bottom: 8px; color: #1a1a1a">${stop.name}</h3>
                <p style="margin: 4px 0; color: #2563eb">Ascenso: ${stop.passengersOn} pasajeros</p>
                <p style="margin: 4px 0; color: #2563eb">Descenso: ${stop.passengersOff} pasajeros</p>
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
      }
    };

    initMap();
  }, []);

  useEffect(() => {
    if (heatmapLayer && map && google) {
      const newData = busStops.map(stop => ({
        location: new google.maps.LatLng(stop.position.lat, stop.position.lng),
        weight: displayMode === 'on' ? stop.passengersOn : stop.passengersOff
      }));
      heatmapLayer.setData(newData);
    }
  }, [displayMode, heatmapLayer, map, google]);

  return (
    <Card className="w-full h-full flex flex-col gap-4">
      <div className="flex flex-col">
        <CardHeader className="flex flex-col gap-4">
          <CardTitle className="mb-4">Mapa de calor - Buenos Aires - Ascenso y descenso de pasajeros</CardTitle>
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