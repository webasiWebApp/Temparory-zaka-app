/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Signed-Out Welcome Screen
 * Visual reference: African urban twilight / Table Mountain backdrop with sleek vehicle,
 * ZAKA "PEOPLE MOVE AFRICA" branding, and primary "Sign In" / secondary "Create Account" buttons.
 */

import React from 'react';

interface ZakaWelcomeScreenProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export const ZakaWelcomeScreen: React.FC<ZakaWelcomeScreenProps> = ({
  onSignIn,
  onSignUp,
}) => {
  return (
    <div className="relative flex-1 flex flex-col w-full h-[100dvh] min-h-[100dvh] overflow-hidden bg-[#0A0A0A] select-none">
      {/* 2. Atmospheric Orange Horizon Glow (Static) */}
      <div className="absolute inset-y-0 left-0 w-3/4 sm:w-2/3 bg-[radial-gradient(ellipse_at_0%_45%,_rgba(255,122,0,0.36)_0%,_rgba(255,100,0,0.12)_45%,_transparent_80%)] pointer-events-none mix-blend-screen opacity-35" />
      
      {/* 3. Animated Kinetic Orange Light Trails across the Wet Road */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-screen">
        <svg
          viewBox="0 0 600 900"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="trailGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFA24C" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#ff860d" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FF5500" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="trailGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFC87A" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#ff860d" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FF3300" stopOpacity="0" />
            </linearGradient>
            <filter id="trailGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Foreground Road Trail 1: Sweeping curve from left horizon around vehicle */}
          <path
            d="M -60 480 Q 180 520, 240 590 T 520 740"
            fill="none"
            stroke="url(#trailGrad1)"
            strokeWidth="3.5"
            strokeLinecap="round"
            filter="url(#trailGlow)"
            className="opacity-75"
          />
          {/* Subtle soft underglow for Trail 1 */}
          <path
            d="M -60 480 Q 180 520, 240 590 T 520 740"
            fill="none"
            stroke="#ff860d"
            strokeWidth="8"
            strokeLinecap="round"
            className="opacity-25"
          />

          {/* Foreground Road Trail 2: Counter curve sweeping into the reflective tarmac */}
          <path
            d="M 640 510 Q 420 540, 350 610 T 60 760"
            fill="none"
            stroke="url(#trailGrad2)"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#trailGlow)"
            className="opacity-70"
          />
          {/* Subtle soft underglow for Trail 2 */}
          <path
            d="M 640 510 Q 420 540, 350 610 T 60 760"
            fill="none"
            stroke="#ff860d"
            strokeWidth="7"
            strokeLinecap="round"
            className="opacity-20"
          />

          {/* Horizon Speed Trail 3: Sharp accent streak near the horizon */}
          <path
            d="M -80 430 Q 120 445, 290 480 T 660 520"
            fill="none"
            stroke="#FFA24C"
            strokeWidth="2"
            strokeLinecap="round"
            filter="url(#trailGlow)"
            className="opacity-60"
          />
        </svg>
      </div>

      {/* 4. Ambient Luminous Static Embers */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute left-[18%] bottom-[32%] w-1.5 h-1.5 rounded-full bg-[#FFB866] opacity-70" />
        <div className="absolute left-[34%] bottom-[28%] w-1 h-1 rounded-full bg-[#FFA333] opacity-60" />
        <div className="absolute left-[62%] bottom-[35%] w-2 h-2 rounded-full bg-primary opacity-80" />
        <div className="absolute left-[78%] bottom-[30%] w-1.5 h-1.5 rounded-full bg-[#FFC580] opacity-70" />
        <div className="absolute left-[48%] bottom-[24%] w-1 h-1 rounded-full bg-[#FFA033] opacity-60" />
      </div>
      
      {/* 5. Subtle Dotted Africa Map in the upper-right background */}
      <div className="absolute top-12 right-2 sm:right-8 w-64 sm:w-80 h-72 sm:h-96 pointer-events-none opacity-45 mix-blend-screen select-none">
        <svg viewBox="0 0 160 190" className="w-full h-full fill-primary">
          {/* North Africa / Sahara / Mediterranean coast */}
          <circle cx="20" cy="18" r="1.5" /><circle cx="28" cy="17" r="1.5" /><circle cx="36" cy="16" r="1.5" /><circle cx="44" cy="15" r="1.5" /><circle cx="52" cy="15" r="1.5" /><circle cx="60" cy="16" r="1.5" /><circle cx="68" cy="18" r="1.5" /><circle cx="76" cy="20" r="1.5" /><circle cx="84" cy="20" r="1.5" /><circle cx="92" cy="22" r="1.5" />
          <circle cx="16" cy="26" r="1.5" /><circle cx="24" cy="25" r="1.5" /><circle cx="32" cy="24" r="1.5" /><circle cx="40" cy="23" r="1.5" /><circle cx="48" cy="23" r="1.5" /><circle cx="56" cy="24" r="1.5" /><circle cx="64" cy="26" r="1.5" /><circle cx="72" cy="27" r="1.5" /><circle cx="80" cy="28" r="1.5" /><circle cx="88" cy="29" r="1.5" /><circle cx="96" cy="30" r="1.5" />
          <circle cx="14" cy="34" r="1.5" /><circle cx="22" cy="33" r="1.5" /><circle cx="30" cy="32" r="1.5" /><circle cx="38" cy="31" r="1.5" /><circle cx="46" cy="31" r="1.5" /><circle cx="54" cy="32" r="1.5" /><circle cx="62" cy="34" r="1.5" /><circle cx="70" cy="35" r="1.5" /><circle cx="78" cy="36" r="1.5" /><circle cx="86" cy="37" r="1.5" /><circle cx="94" cy="38" r="1.5" /><circle cx="102" cy="40" r="1.5" />
          <circle cx="12" cy="42" r="1.5" /><circle cx="20" cy="41" r="1.5" /><circle cx="28" cy="40" r="1.5" /><circle cx="36" cy="39" r="1.5" /><circle cx="44" cy="39" r="1.5" /><circle cx="52" cy="40" r="1.5" /><circle cx="60" cy="42" r="1.5" /><circle cx="68" cy="43" r="1.5" /><circle cx="76" cy="44" r="1.5" /><circle cx="84" cy="45" r="1.5" /><circle cx="92" cy="46" r="1.5" /><circle cx="100" cy="48" r="1.5" /><circle cx="108" cy="50" r="1.5" />
          {/* West Africa bulge */}
          <circle cx="8" cy="50" r="1.5" /><circle cx="16" cy="49" r="1.5" /><circle cx="24" cy="48" r="1.5" /><circle cx="32" cy="47" r="1.5" /><circle cx="40" cy="47" r="1.5" /><circle cx="48" cy="48" r="1.5" /><circle cx="56" cy="50" r="1.5" /><circle cx="64" cy="51" r="1.5" /><circle cx="72" cy="52" r="1.5" /><circle cx="80" cy="53" r="1.5" /><circle cx="88" cy="54" r="1.5" /><circle cx="96" cy="56" r="1.5" /><circle cx="104" cy="58" r="1.5" /><circle cx="112" cy="60" r="1.5" />
          <circle cx="6" cy="58" r="1.5" /><circle cx="14" cy="57" r="1.5" /><circle cx="22" cy="56" r="1.5" /><circle cx="30" cy="55" r="1.5" /><circle cx="38" cy="55" r="1.5" /><circle cx="46" cy="56" r="1.5" /><circle cx="54" cy="58" r="1.5" /><circle cx="62" cy="59" r="1.5" /><circle cx="70" cy="60" r="1.5" /><circle cx="78" cy="61" r="1.5" /><circle cx="86" cy="62" r="1.5" /><circle cx="94" cy="64" r="1.5" /><circle cx="102" cy="66" r="1.5" /><circle cx="110" cy="68" r="1.5" /><circle cx="118" cy="70" r="1.5" />
          {/* Horn of Africa */}
          <circle cx="8" cy="66" r="1.5" /><circle cx="16" cy="65" r="1.5" /><circle cx="24" cy="64" r="1.5" /><circle cx="32" cy="63" r="1.5" /><circle cx="40" cy="63" r="1.5" /><circle cx="48" cy="64" r="1.5" /><circle cx="56" cy="66" r="1.5" /><circle cx="64" cy="67" r="1.5" /><circle cx="72" cy="68" r="1.5" /><circle cx="80" cy="69" r="1.5" /><circle cx="88" cy="70" r="1.5" /><circle cx="96" cy="72" r="1.5" /><circle cx="104" cy="74" r="1.5" /><circle cx="112" cy="76" r="1.5" /><circle cx="120" cy="78" r="1.5" /><circle cx="126" cy="80" r="1.5" />
          <circle cx="14" cy="74" r="1.5" /><circle cx="22" cy="73" r="1.5" /><circle cx="30" cy="72" r="1.5" /><circle cx="38" cy="72" r="1.5" /><circle cx="46" cy="73" r="1.5" /><circle cx="54" cy="75" r="1.5" /><circle cx="62" cy="76" r="1.5" /><circle cx="70" cy="77" r="1.5" /><circle cx="78" cy="78" r="1.5" /><circle cx="86" cy="79" r="1.5" /><circle cx="94" cy="81" r="1.5" /><circle cx="102" cy="83" r="1.5" /><circle cx="110" cy="85" r="1.5" /><circle cx="118" cy="87" r="1.5" /><circle cx="124" cy="88" r="1.5" />
          {/* Central Africa & Equator */}
          <circle cx="34" cy="82" r="1.5" /><circle cx="42" cy="81" r="1.5" /><circle cx="50" cy="82" r="1.5" /><circle cx="58" cy="83" r="1.5" /><circle cx="66" cy="84" r="1.5" /><circle cx="74" cy="85" r="1.5" /><circle cx="82" cy="86" r="1.5" /><circle cx="90" cy="87" r="1.5" /><circle cx="98" cy="89" r="1.5" /><circle cx="106" cy="91" r="1.5" /><circle cx="114" cy="93" r="1.5" />
          <circle cx="38" cy="90" r="1.5" /><circle cx="46" cy="89" r="1.5" /><circle cx="54" cy="90" r="1.5" /><circle cx="62" cy="91" r="1.5" /><circle cx="70" cy="92" r="1.5" /><circle cx="78" cy="93" r="1.5" /><circle cx="86" cy="94" r="1.5" /><circle cx="94" cy="96" r="1.5" /><circle cx="102" cy="98" r="1.5" /><circle cx="108" cy="100" r="1.5" />
          <circle cx="42" cy="98" r="1.5" /><circle cx="50" cy="97" r="1.5" /><circle cx="58" cy="98" r="1.5" /><circle cx="66" cy="99" r="1.5" /><circle cx="74" cy="100" r="1.5" /><circle cx="82" cy="101" r="1.5" /><circle cx="90" cy="102" r="1.5" /><circle cx="98" cy="104" r="1.5" /><circle cx="104" cy="106" r="1.5" />
          {/* East Africa & Great Lakes */}
          <circle cx="46" cy="106" r="1.5" /><circle cx="54" cy="105" r="1.5" /><circle cx="62" cy="106" r="1.5" /><circle cx="70" cy="107" r="1.5" /><circle cx="78" cy="108" r="1.5" /><circle cx="86" cy="109" r="1.5" /><circle cx="94" cy="110" r="1.5" /><circle cx="100" cy="112" r="1.5" />
          <circle cx="48" cy="114" r="1.5" /><circle cx="56" cy="113" r="1.5" /><circle cx="64" cy="114" r="1.5" /><circle cx="72" cy="115" r="1.5" /><circle cx="80" cy="116" r="1.5" /><circle cx="88" cy="117" r="1.5" /><circle cx="96" cy="118" r="1.5" />
          <circle cx="50" cy="122" r="1.5" /><circle cx="58" cy="121" r="1.5" /><circle cx="66" cy="122" r="1.5" /><circle cx="74" cy="123" r="1.5" /><circle cx="82" cy="124" r="1.5" /><circle cx="90" cy="125" r="1.5" />
          {/* Southern Africa narrowing */}
          <circle cx="52" cy="130" r="1.5" /><circle cx="60" cy="129" r="1.5" /><circle cx="68" cy="130" r="1.5" /><circle cx="76" cy="131" r="1.5" /><circle cx="84" cy="132" r="1.5" /><circle cx="92" cy="133" r="1.5" />
          {/* Madagascar */}
          <circle cx="112" cy="125" r="1.3" /><circle cx="114" cy="132" r="1.3" /><circle cx="116" cy="139" r="1.3" /><circle cx="114" cy="146" r="1.3" />
          <circle cx="54" cy="138" r="1.5" /><circle cx="62" cy="137" r="1.5" /><circle cx="70" cy="138" r="1.5" /><circle cx="78" cy="139" r="1.5" /><circle cx="86" cy="140" r="1.5" />
          <circle cx="56" cy="146" r="1.5" /><circle cx="64" cy="145" r="1.5" /><circle cx="72" cy="146" r="1.5" /><circle cx="80" cy="147" r="1.5" />
          <circle cx="58" cy="154" r="1.5" /><circle cx="66" cy="153" r="1.5" /><circle cx="74" cy="154" r="1.5" />
          {/* South Africa Cape tip */}
          <circle cx="62" cy="162" r="1.5" /><circle cx="70" cy="161" r="1.5" />
          <circle cx="66" cy="169" r="1.5" />
        </svg>
      </div>

      {/* 6. Top subtle vignette */}
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 via-black/25 to-transparent pointer-events-none" />
      {/* Bottom gradient framing buttons while keeping the wet reflective road and car visible */}
      <div className="absolute inset-x-0 bottom-0 h-64 sm:h-72 bg-gradient-to-t from-[#050505] via-[#050505]/75 to-transparent pointer-events-none" />

      {/* 3. Screen Content Wrapper */}
      <div className="relative z-10 flex flex-col justify-between h-full w-full max-w-md mx-auto px-6 py-8 sm:py-12">
        {/* Top spacer for framing the mountain */}
        <div className="w-full pt-6 sm:pt-10" />

        {/* Center / Upper-Middle: ZAKA Wordmark & Sub-brand */}
        <div className="flex flex-col items-center justify-center text-center -mt-8 sm:-mt-12 select-none">
          {/* Stylized Vector ZAKA Wordmark Matching Reference */}
          <div className="flex items-center justify-center drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
            <svg
              viewBox="0 0 280 64"
              className="w-60 sm:w-72 h-auto"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="ZAKA"
            >
              {/* Z */}
              <path
                d="M 22 14 H 68 L 30 50 H 76"
                stroke="#FFFFFF"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* A (first) */}
              <path
                d="M 94 50 L 118 14 L 142 50"
                stroke="#FFFFFF"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Orange Location Pin Accent in apex of A */}
              <path
                d="M 118 28 C 120.8 28 123 30.2 123 33 C 123 36.8 118 42 118 42 C 118 42 113 36.8 113 33 C 113 30.2 115.2 28 118 28 Z"
                fill="#ff860d"
              />
              <circle cx="118" cy="33" r="1.5" fill="#FFFFFF" />

              {/* K */}
              <path
                d="M 166 14 V 50 M 194 14 L 168 33.5 L 196 50"
                stroke="#FFFFFF"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* A (second) */}
              <path
                d="M 218 50 L 242 14 L 266 50"
                stroke="#FFFFFF"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Orange Location Pin Accent in apex of A */}
              <path
                d="M 242 28 C 244.8 28 247 30.2 247 33 C 247 36.8 242 42 242 42 C 242 42 237 36.8 237 33 C 237 30.2 239.2 28 242 28 Z"
                fill="#ff860d"
              />
              <circle cx="242" cy="33" r="1.5" fill="#FFFFFF" />
            </svg>
          </div>

          {/* Subtitle: PEOPLE MOVE AFRICA */}
          <p className="mt-3.5 sm:mt-4 text-xs sm:text-[13px] font-bold tracking-[0.32em] text-white/95 uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            PEOPLE MOVE AFRICA
          </p>
        </div>

        {/* Bottom Actions: Sign in & Create account */}
        <div className="w-full flex flex-col gap-3 pb-3 sm:pb-6">
          {/* Primary Orange "Sign in" Button */}
          <button
            id="btn-welcome-signin"
            type="button"
            onClick={onSignIn}
            className="w-full h-13.5 sm:h-14 flex items-center justify-center rounded-full bg-primary hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.98] text-on-primary font-bold text-base sm:text-[17px] transition-all cursor-pointer tracking-normal"
          >
            Sign in
          </button>

          {/* Secondary "Create account" Button */}
          <button
            id="btn-welcome-signup"
            type="button"
            onClick={onSignUp}
            className="w-full h-13.5 sm:h-14 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/75 active:scale-[0.98] border border-white/20 hover:border-white/35 text-white font-semibold text-base sm:text-[17px] backdrop-blur-md transition-all cursor-pointer tracking-normal "
          >
            Create account
          </button>
        </div>
      </div>
    </div>
  );
};
