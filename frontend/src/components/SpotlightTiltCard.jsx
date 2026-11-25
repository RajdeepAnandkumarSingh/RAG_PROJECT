import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

const TILT_SPRING = { stiffness: 260, damping: 24, mass: 0.6 };

/**
 * Reusable 3D perspective tilt card with cursor-tracking radial spotlight glow.
 * Clamps 3D rotation to +/-4 degrees on hover and smoothly resets on leave.
 */
export default function SpotlightTiltCard({
  children,
  className = '',
  as = 'div',
  theme = 'dark',
  spotlightColor,
  borderGlowColor,
  onClick,
  type = 'button',
  disabled = false,
  whileTap,
  ...rest
}) {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const isDark = theme === 'dark';

  const normX = useMotionValue(0);
  const normY = useMotionValue(0);
  const spotX = useMotionValue(0);
  const spotY = useMotionValue(0);

  const smoothNormX = useSpring(normX, TILT_SPRING);
  const smoothNormY = useSpring(normY, TILT_SPRING);

  const rotateX = useTransform(smoothNormY, [-0.5, 0.5], [4, -4]);
  const rotateY = useTransform(smoothNormX, [-0.5, 0.5], [-4, 4]);

  const resolvedSurfaceGlow =
    spotlightColor ||
    (isDark ? 'rgba(16, 185, 129, 0.14)' : 'rgba(16, 185, 129, 0.11)');

  const resolvedBorderGlow =
    borderGlowColor ||
    (isDark ? 'rgba(16, 185, 129, 0.65)' : 'rgba(5, 150, 105, 0.52)');

  const surfaceBackground = useTransform(
    [spotX, spotY],
    ([x, y]) =>
      `radial-gradient(280px circle at ${x}px ${y}px, ${resolvedSurfaceGlow}, transparent 75%)`
  );

  const borderBackground = useTransform(
    [spotX, spotY],
    ([x, y]) =>
      `radial-gradient(220px circle at ${x}px ${y}px, ${resolvedBorderGlow}, transparent 72%)`
  );

  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    spotX.set(relX);
    spotY.set(relY);

    const clampedX = Math.max(-0.5, Math.min(0.5, relX / rect.width - 0.5));
    const clampedY = Math.max(-0.5, Math.min(0.5, relY / rect.height - 0.5));
    normX.set(clampedX);
    normY.set(clampedY);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    normX.set(0);
    normY.set(0);
  };

  const MotionTag = as === 'button' ? motion.button : motion.div;

  return (
    <MotionTag
      ref={cardRef}
      type={as === 'button' ? type : undefined}
      disabled={as === 'button' ? disabled : undefined}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileTap={whileTap}
      style={{
        transformPerspective: 1000,
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      className={`relative overflow-hidden will-change-transform ${className}`}
      {...rest}
    >
      {/* Radial Cursor-Tracking Surface Spotlight */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          background: surfaceBackground,
          opacity: isHovered ? 1 : 0,
        }}
      />

      {/* Radial Cursor-Tracking Border Spotlight */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          padding: '1px',
          background: borderBackground,
          opacity: isHovered ? 1 : 0,
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />

      <div className="relative z-10 flex flex-col flex-1 w-full h-full justify-between">
        {children}
      </div>
    </MotionTag>
  );
}
