import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Loader } from "@googlemaps/js-api-loader";
import lodash from 'lodash-es';
import config from '../config';
import readXlsxFile from 'read-excel-file';

import excelFile from '../../data/Transacciones_small.xlsx';

const BusRouteHeatmap = () => {
  const [map, setMap] = useState(null);
  const [heatmapLayer, setHeatmapLayer] = useState(null);
  const [displayMode, setDisplayMode] = useState('on');
  const [viewMode, setViewMode] = useState('clustered');
  const [google, setGoogle] = useState(null);
  const [rawPoints, setRawPoints] = useState([]);
  const [clusteredStops, setClusteredStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const clusterStops = (points) => {
    const processedStops = points.reduce((acc, curr) => {
      const key = curr.section;
      if (!acc[key]) {
        acc[key] = {
          section: curr.section,
          position: curr.position,
          passengersOn: 0,
          passengersOff: 0
        };
      }
      if (curr.tipo === 627) acc[key].passengersOn++;
      if (curr.tipo === 624) acc[key].passengersOff++;
      return acc;
    }, {});

    const stops = Object.values(processedStops);

    const clusters = [];
    const processed = new Set();

    stops.forEach((stop, index) => {
      if (processed.has(index)) return;

      const cluster = {
        sections: [stop.section],
        position: stop.position,
        passengersOn: stop.passengersOn,
        passengersOff: stop.passengersOff
      };

      stops.forEach((otherStop, otherIndex) => {
        if (index === otherIndex || processed.has(otherIndex)) return;

        const distance = calculateDistance(
          stop.position.lat,
          stop.position.lng,
          otherStop.position.lat,
          otherStop.position.lng
        );

        if (distance <= 2.5) {
          cluster.sections.push(otherStop.section);
          cluster.passengersOn += otherStop.passengersOn;
          cluster.passengersOff += otherStop.passengersOff;
          processed.add(otherIndex);
        }
      });

      processed.add(index);
      clusters.push(cluster);
    });

    return clusters.map((cluster, index) => ({
      section: `Cluster ${index + 2}`, //TODO: Remove this line
      position: cluster.position,
      name: `Sections ${cluster.sections.join(', ')}`,
      passengersOn: cluster.passengersOn,
      passengersOff: cluster.passengersOff,
      includedSections: cluster.sections
    })).slice(1); //TODO: Remove this line
  };

  const clearMarkers = () => {
    markers.forEach(marker => marker.setMap(null));
    setMarkers([]);
    if (directionsRenderer) {
      directionsRenderer.setMap(null);
    }
    if (heatmapLayer) {
      heatmapLayer.setMap(null);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(excelFile);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const rows = await readXlsxFile(blob);

        const headers = rows[0];
        
        const data = rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });

        // Create raw points without any grouping
        const points = data.map(row => ({
          section: parseInt(row.Seccion),
          tipo: parseInt(row['Tipo Trx']),
          position: {
            lat: parseFloat(String(row.Longitud).replace(',', '.')),
            lng: parseFloat(String(row.Latitud).replace(',', '.'))
          }
        })).filter(point => !isNaN(point.section) && !isNaN(point.tipo) && 
                           !isNaN(point.position.lat) && !isNaN(point.position.lng));

        const filteredPoints = points.filter(point => point.section !== 1);
        setRawPoints(filteredPoints); //TODO: Remove this line
        setClusteredStops(clusterStops(points));
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

  const updateMap = async () => {
    if (!map || !google) return;

    clearMarkers();

    const points = viewMode === 'clustered' ? clusteredStops : rawPoints;

    // Create new markers
    const newMarkers = points.map(point => {
      const marker = new google.maps.Marker({
        map: map,
        position: point.position,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: viewMode === 'clustered' ? 8 : 4,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      marker.addListener('click', () => {
        const infoContent = document.createElement('div');
        if (viewMode === 'clustered') {
          infoContent.innerHTML = `
            <div style="padding: 10px">
              <h3 style="font-weight: bold; margin-bottom: 8px; color: #1a1a1a">${point.section}</h3>
              <p style="margin: 4px 0; color: #666">Includes sections: ${point.includedSections.join(', ')}</p>
              <p style="margin: 4px 0; color: #2563eb">Boarding: ${point.passengersOn} passengers</p>
              <p style="margin: 4px 0; color: #2563eb">Alighting: ${point.passengersOff} passengers</p>
            </div>
          `;
        } else {
          infoContent.innerHTML = `
            <div style="padding: 10px">
              <h3 style="font-weight: bold; margin-bottom: 8px; color: #1a1a1a">Section ${point.section}</h3>
              <p style="margin: 4px 0; color: #2563eb">Transaction Type: ${point.tipo === 627 ? 'Boarding' : 'Alighting'}</p>
            </div>
          `;
        }
        
        const infoWindow = new google.maps.InfoWindow({
          content: infoContent
        });
        
        infoWindow.open({
          anchor: marker,
          map: map
        });
      });

      return marker;
    });

    setMarkers(newMarkers);

    if (viewMode === 'clustered') {
      // Create route only for clustered view
      const directionsService = new google.maps.DirectionsService();
      const renderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeOpacity: 0.8,
          strokeWeight: 3
        }
      });

      setDirectionsRenderer(renderer);

      const waypoints = points.slice(1, -1).map(point => ({
        location: new google.maps.LatLng(point.position.lat, point.position.lng),
        stopover: true
      }));

      const request = {
        origin: new google.maps.LatLng(points[0].position.lat, points[0].position.lng),
        destination: new google.maps.LatLng(points[points.length - 1].position.lat, points[points.length - 1].position.lng),
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false
      };

      directionsService.route(request, (result, status) => {
        if (status === 'OK') {
          renderer.setDirections(result);
        } else {
          console.error('Directions request failed:', status);
        }
      });

      // Create heatmap only for clustered view
      const heatmap = new google.maps.visualization.HeatmapLayer({
        data: points.map(point => ({
          location: new google.maps.LatLng(point.position.lat, point.position.lng),
          weight: displayMode === 'on' ? point.passengersOn : point.passengersOff
        })),
        map: map,
        radius: 60,
        opacity: 0.7
      });

      setHeatmapLayer(heatmap);
    }
  };

  useEffect(() => {
    const initMap = async () => {
      if (!rawPoints.length || !clusteredStops.length) return;

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

        const center = rawPoints[0].position;
        
        const mapInstance = new googleInstance.maps.Map(mapElement, {
          center: center,
          zoom: 13,
          mapId: config.mapId,
          streetViewControl: false,
          zoomControl: true,
          mapTypeControl: false,
        });

        setMap(mapInstance);

      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map. Please check your Google Maps API key.');
      }
    };

    initMap();
  }, [rawPoints, clusteredStops]);

  useEffect(() => {
    if (map && google) {
      updateMap();
    }
  }, [viewMode, displayMode, map, google]);

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
              className={`px-4 py-2 rounded ${viewMode === 'clustered' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              onClick={() => setViewMode('clustered')}
            >
              Vista Agrupada (2.5km)
            </button>
            <button
              className={`px-4 py-2 rounded ${viewMode === 'raw' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              onClick={() => setViewMode('raw')}
            >
              Puntos sin agrupar
            </button>
          </div>
          {viewMode === 'clustered' && (
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
          )}
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