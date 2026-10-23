'use client';
import { useEffect } from 'react';
import { registerPwa } from '@/lib/offline';

// Registers the service worker (production only) once the page has loaded.
export default function PwaRegister() {
  useEffect(() => { void registerPwa(); }, []);
  return null;
}
