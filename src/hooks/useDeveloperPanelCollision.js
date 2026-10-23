import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SCAN_INTERVAL = 800;
const BOTTOM_ZONE_PX = 150;
const MARGIN = 12;
const BASE_OFFSET = 20;
const BUTTON_HALF_WIDTH = 120;
const BUTTON_HEIGHT = 48;

/**
 * Collision detection for the Developer Panel floating button.
 *
 * Scans for fixed/sticky elements in the bottom-center area (floating action buttons,
 * bottom navigation bars, sticky action bars with Save/Submit/Next/Previous buttons)
 * and returns a bottom offset that keeps the developer button clear of all of them.
 */
function scanCollisions() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centerX = viewportWidth / 2;

  const buttonLeft = centerX - BUTTON_HALF_WIDTH;
  const buttonRight = centerX + BUTTON_HALF_WIDTH;
  const buttonBottom = viewportHeight - BASE_OFFSET;
  const buttonTop = buttonBottom - BUTTON_HEIGHT;

  let maxOverlap = 0;

  const candidates = document.querySelectorAll('[class*="fixed"], [class*="sticky"]');

  for (const el of candidates) {
    if (!el.isConnected) continue;
    if (el.dataset.devPanel) continue;

    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') continue;
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    // Must be in the bottom zone
    if (rect.bottom < viewportHeight - BOTTOM_ZONE_PX) continue;

    // Check horizontal overlap with button area
    if (rect.right < buttonLeft || rect.left > buttonRight) continue;

    // Check vertical overlap
    if (rect.top > buttonBottom || rect.bottom < buttonTop) continue;

    const verticalOverlap = Math.min(buttonBottom, rect.bottom) - Math.max(buttonTop, rect.top);
    if (verticalOverlap > maxOverlap) {
      maxOverlap = verticalOverlap;
    }
  }

  return maxOverlap;
}

export function useDeveloperPanelCollision(isOpen) {
  const [bottomOffset, setBottomOffset] = useState(BASE_OFFSET);
  const location = useLocation();
  const rafRef = useRef(null);

  useEffect(() => {
    if (isOpen) return;

    const calculate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const overlap = scanCollisions();
        setBottomOffset(overlap > 0 ? BASE_OFFSET + overlap + MARGIN : BASE_OFFSET);
      });
    };

    calculate();
    const interval = setInterval(calculate, SCAN_INTERVAL);
    window.addEventListener('resize', calculate);
    window.addEventListener('scroll', calculate, true);

    let observer;
    try {
      observer = new MutationObserver(calculate);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    } catch { /* ignore */ }

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', calculate);
      window.removeEventListener('scroll', calculate, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (observer) observer.disconnect();
    };
  }, [isOpen, location.pathname]);

  return bottomOffset;
}