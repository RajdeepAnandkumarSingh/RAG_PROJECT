import React, { useEffect, useRef } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';

function formatNumericValue(num, { decimals, formatLocale, prefix, suffix }) {
  const safeNum = Number.isFinite(num) ? num : 0;
  let formatted;
  if (decimals > 0) {
    formatted = safeNum.toFixed(decimals);
  } else if (formatLocale) {
    formatted = Math.round(safeNum).toLocaleString();
  } else {
    formatted = String(Math.round(safeNum));
  }
  return `${prefix}${formatted}${suffix}`;
}

/**
 * Spring-interpolated numeric counter that updates DOM text directly
 * at display refresh rate without triggering React re-renders.
 */
export default function AnimatedCounter({
  value = 0,
  decimals = 0,
  formatLocale = false,
  prefix = '',
  suffix = '',
  className = '',
  startFrom = 0,
}) {
  const spanRef = useRef(null);
  const numericValue = Number(value) || 0;
  const motionValue = useMotionValue(startFrom);
  const springValue = useSpring(motionValue, {
    stiffness: 90,
    damping: 20,
    mass: 0.75,
  });

  useEffect(() => {
    motionValue.set(numericValue);
  }, [numericValue, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (spanRef.current) {
        spanRef.current.textContent = formatNumericValue(latest, {
          decimals,
          formatLocale,
          prefix,
          suffix,
        });
      }
    });
    return () => unsubscribe();
  }, [springValue, decimals, formatLocale, prefix, suffix]);

  return (
    <span ref={spanRef} className={className}>
      {formatNumericValue(numericValue, {
        decimals,
        formatLocale,
        prefix,
        suffix,
      })}
    </span>
  );
}
