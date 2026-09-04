import React from "react";

const accents = {
  intro: { label: "Metodická žába se šanonem", prop: "folder" },
  result: { label: "Metodická žába s mapou", prop: "map" },
  level: { label: "Metodická žába s brýlemi a metodikou", prop: "book" },
};

export default function FrogMascot({ variant = "intro", className = "" }) {
  const accent = accents[variant] || accents.intro;
  return <svg className={className} viewBox="0 0 260 190" role="img" aria-label={accent.label}>
    <defs>
      <linearGradient id={`frog-body-${variant}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6e9270"/><stop offset="1" stopColor="#355d4b"/>
      </linearGradient>
    </defs>
    <ellipse cx="130" cy="171" rx="88" ry="9" fill="#1e293b" opacity=".12"/>
    <path d="M77 125c-22 2-39 13-47 30 22 7 43 3 58-10M183 125c22 2 39 13 47 30-22 7-43 3-58-10" fill="#52785e" stroke="#27493e" strokeWidth="5" strokeLinecap="round"/>
    <ellipse cx="130" cy="111" rx="62" ry="56" fill={`url(#frog-body-${variant})`} stroke="#27493e" strokeWidth="5"/>
    <circle cx="98" cy="61" r="24" fill="#789a72" stroke="#27493e" strokeWidth="5"/>
    <circle cx="162" cy="61" r="24" fill="#789a72" stroke="#27493e" strokeWidth="5"/>
    <circle cx="99" cy="61" r="9" fill="#fff"/><circle cx="161" cy="61" r="9" fill="#fff"/>
    <circle cx="102" cy="62" r="4" fill="#172554"/><circle cx="158" cy="62" r="4" fill="#172554"/>
    <path d="M108 96c13 8 31 8 44 0" fill="none" stroke="#213f37" strokeWidth="5" strokeLinecap="round"/>
    {accent.prop === "folder" && <g transform="translate(97 115)"><path d="M0 5h25l7 8h36v45H0z" fill="#e7a353" stroke="#8b4b20" strokeWidth="4"/><path d="M7 21h54" stroke="#fff8e8" strokeWidth="5"/><path d="M7 32h42M7 42h48" stroke="#8b4b20" strokeWidth="3" opacity=".55"/></g>}
    {accent.prop === "map" && <g transform="translate(82 116)"><path d="M0 5l31-7 32 9 33-8v51l-33 8-32-9-31 7z" fill="#fff8e8" stroke="#8b4b20" strokeWidth="4"/><path d="M31-2v51M63 7v51" stroke="#d69c55" strokeWidth="3"/><path d="M10 39c15-20 28 3 43-15s24 4 34-8" fill="none" stroke="#315f8d" strokeWidth="4" strokeDasharray="6 5"/></g>}
    {accent.prop === "book" && <g><path d="M82 126q24-8 48 4v45q-24-12-48-4zM178 126q-24-8-48 4v45q24-12 48-4z" fill="#fff8e8" stroke="#8b4b20" strokeWidth="4"/><path d="M130 130v45" stroke="#8b4b20" strokeWidth="4"/><path d="M80 56q18-12 37 0M143 56q18-12 37 0" fill="none" stroke="#172554" strokeWidth="4"/><path d="M80 56c0 24 37 24 37 0M143 56c0 24 37 24 37 0M117 60h26" fill="none" stroke="#172554" strokeWidth="4"/></g>}
  </svg>;
}

