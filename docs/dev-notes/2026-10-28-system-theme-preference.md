# System theme preference

Date: 2026-10-28  
Requirements: NFR-08, DASH-04

RiskSense now stores `system|light|dark` as browser theme intent. System is the default, resolves the device palette before paint and follows live device changes; explicit Light/Dark stay fixed. A controlled account popover presents the accessible three-radio control, closes on outside click or Escape, and stays open through rapid selections. Theme changes use a non-blocking 240 ms semantic transition with a reduced-motion bypass. Focused coverage verifies persistence, hydration, 390 px containment, rapid selection and Requestor layouts at 390, 768, 1024 and 1440 px.

Verification: full lint and typecheck pass, the production build generates 31 pages, and the complete mocked frontend suite passes 81/81 in 55.7 seconds.
