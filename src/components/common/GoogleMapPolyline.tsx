/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Google Maps Polyline Component
 * Renders high-contrast dual-layer route geometry on Google Maps.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

export interface PolylineProps extends google.maps.PolylineOptions {
  path?: google.maps.LatLngLiteral[];
  onClick?: (e: google.maps.MapMouseEvent) => void;
}

export type PolylineRef = google.maps.Polyline;

export const Polyline = forwardRef<PolylineRef | null, PolylineProps>((props, ref) => {
  const { path, onClick, ...polylineOptions } = props;
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    const polyline = new google.maps.Polyline({
      ...polylineOptions,
      path: path || [],
      map,
    });

    polylineRef.current = polyline;

    if (onClick) {
      const listener = polyline.addListener('click', onClick);
      return () => {
        listener.remove();
        polyline.setMap(null);
        polylineRef.current = null;
      };
    }

    return () => {
      polyline.setMap(null);
      polylineRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (polylineRef.current && path) {
      polylineRef.current.setPath(path);
    }
  }, [path]);

  useEffect(() => {
    if (polylineRef.current) {
      polylineRef.current.setOptions(polylineOptions);
    }
  }, [polylineOptions]);

  useImperativeHandle(ref, () => polylineRef.current as google.maps.Polyline, []);

  return null;
});

Polyline.displayName = 'GoogleMapPolyline';
