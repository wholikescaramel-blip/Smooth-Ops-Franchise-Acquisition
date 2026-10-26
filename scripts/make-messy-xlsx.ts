// Builds test-data/messy-applications.xlsx: a deliberately nasty workbook for testing the parser and engine.
import * as XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';

const hdr = ['App ID', 'Name of applicant', 'City', 'State', 'PIN', 'Investment (Rs lakh)', 'Yrs of retail exp', 'Business', 'Space', 'Sq ft', 'Floor', 'Launch in (months)', 'Language', 'Notes'];
const B = 'Bengaluru', M = 'Mysuru';
const rows: unknown[][] = [
  // clean-ish winner and a same-pin rival
  ['APP-101', '  rohan gowda ', 'bengaluru', 'karnataka', 560008, '₹85L', 6, 'footwear shops', 'owned', '600 sq ft', 'GROUND', '4 months', 'english', ''],
  ['APP-102', 'Meera Nair', 'Bangalore', 'KA', '560008', '70 lakh', '4 yrs', 'Apparel boutique', 'Rented ', 450, 'ground floor', 3, 'ENGLISH', 'happy to move to another pin'],
  // existing-store pins (one with a space inside the pin)
  ['APP-103', 'Suresh Patil', B, 'Karnataka', '560001', 90, 5, 'Electronics, 2 shops', 'rented', 500, 'gf', 4, 'Hindi', ''],
  ['APP-104', 'Anitha Kumari', B, 'Karnataka', '560 034', 55, 2, 'grocery', 'Rented', 300, 'Ground', 3, 'Kannada', ''],
  // duplicate application id
  ['APP-105', 'Vikram Rao', B, 'Karnataka', 560048, 60, 3, 'apparel', 'Rented', 350, 'Ground', 3, 'English', ''],
  ['APP-105', 'Divya Rao', B, 'Karnataka', 560078, 50, 1, 'small boutique', 'Rented', 320, 'Ground', 3, 'Kannada', 'second row reusing the id'],
  // same person, different pin; same person same pin
  ['APP-106', 'Meera Nair', B, 'Karnataka', 560025, 70, 4, 'Apparel boutique', 'Rented', 450, 'Ground', 3, 'English', 'applied again for a second area'],
  ['APP-107', 'Meera Nair', B, 'Karnataka', 560008, '70', 4, 'Apparel boutique', 'Rented', 450, 'Ground', 3, 'English', 'exact duplicate of APP-102'],
  // location problems
  ['APP-108', 'Kavya Murthy', M, 'Karnataka', 560012, 50, 3, 'garments', 'Rented', 300, 'Ground', 3, 'Kannada', 'pin belongs to Bengaluru'],
  ['APP-109', 'Zainab Khan', B, 'Karnataka', '56003', 65, 3, 'fashion accessories', 'Rented', 340, 'Ground', 3, 'Hindi', 'pin has 5 digits'],
  ['APP-110', 'Sunita Desai', B, 'Karnataka', 560090, 60, 2, 'mobile accessories', 'Rented', 320, 'Ground', 3, 'English', 'pin outside every territory'],
  ['APP-111', 'Ganesh Naik', 'Atlantis', 'Karnataka', 570001, 55, 2, 'kirana', 'Rented', 300, 'Ground', 3, 'Kannada', 'unknown city, valid Mysuru pin'],
  ['APP-112', 'Sneha Kulkarni', null, null, 590006, 65, 3, 'apparel', 'Rented', 400, 'Mall unit', 3, 'English', 'city and state blank'],
  ['APP-113', 'Arun Menon', B, 'Karnataka', 560035, 80, 4, 'pharmacy', 'Owned', 500, 'Ground', 3, 'English', 'one pin from an existing store'],
  // money in every shape
  ['APP-114', 'Mahesh Kamath', 'Tumakuru', 'Karnataka', 572101, '1.2 cr', 8, 'footwear chain owner (4 shops)', 'Owned', 450, 'Ground', 4, 'Kannada', ''],
  ['APP-115', 'Pooja Joshi', 'Hubballi-Dharwad', 'Karnataka', 580021, 3000000, 4, 'electronics retail', 'Owned', 500, 'Ground', 3, 'Kannada', 'amount typed in rupees; territory has 0 slots'],
  ['APP-116', 'Raju Patel', 'Davanagere', 'Karnataka', 577001, null, 0, 'NRI investor', 'Rented', 120, 'Upper', 6, 'English', 'investment blank, tiny upper-floor unit'],
  ['APP-117', 'Shruti Bhat', 'Tumakuru', 'Karnataka', 572102, 0, 1, 'tailoring', 'Rented', 220, 'Ground', 3, 'Kannada', 'zero investment'],
  ['APP-118', 'Farhan Sheikh', M, 'Karnataka', 570017, 'abc', 2, 'grocery wholesale', 'Rented', 300, 'Ground', 3, 'Hindi', 'unreadable investment, existing store pin'],
  ['APP-119', 'Lakshmi Hegde', M, 'Karnataka', 570023, -5, 2, 'apparel', 'Rented', 280, 'Ground', 4, 'Kannada', 'negative investment'],
  // contradictions
  ['APP-120', 'Imran Pasha', M, 'Karnataka', 570023, 75, 6, 'footwear retail', 'Not yet identified', 300, 'Ground', 5, 'English', 'space says not identified but size and floor are filled'],
  ['APP-121', 'Karthik Reddy', M, 'Karnataka', 570001, 60, 5, 'apparel showroom 5 years', 'NOT YET IDENTIFIED', null, 'Not known', 2, 'Kannada', 'still looking for a shop'],
  ['APP-122', 'Deepa Shetty', 'Mangaluru', 'Karnataka', 575003, 45, 3, 'eyewear', 'Owned', null, 'Ground', 3, 'Kannada', 'owned but size blank'],
  ['APP-123', 'Nikhil Verma', B, 'Karnataka', 560100, 70, 0, 'Runs a chain of 5 shops (family business)', 'Rented', 400, 'Ground', 6, 'Hindi', 'I have been in retail for 12 years'],
  ['APP-124', 'Rekha Poojary', 'Mangaluru', 'Karnataka', 575006, 60, 2, 'garments', 'Rented', 300, 'Ground', 3, 'Tulu', 'I can invest ₹20 lakh only'],
  ['APP-125', 'Anand Kulkarni', 'Mangaluru', 'Karnataka', 575002, 30, 3, 'retail', 'Not yet identified', null, null, 1, 'Kannada', 'want to open ASAP'],
  ['APP-126', 'Rohit Shenoy', 'Belagavi', 'Karnataka', 590002, 40, 1, 'kirana', 'Rented', 260, 'Ground', 'ASAP', 'Kannada', 'launch is text'],
  ['APP-127', 'Priya Hegde', 'Davanagere', 'Karnataka', 577002, 35, 3, 'apparel', 'Rented', 260, 'Ground', 0, 'Kannada', 'launch zero months'],
  // blank / sparse / unicode
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [null, 'ಕಾವ್ಯ ಮೂರ್ತಿ', B, 'Karnataka', 560085, 52, 2, 'ಬಟ್ಟೆ ಅಂಗಡಿ (clothes shop)', 'Rented', 330, 'Ground', 3, 'Kannada', 'no application id, Kannada name'],
  ['APP-129', null, null, null, null, null, null, null, null, null, null, null, null, null],
  ['APP-130', 'Ravi (no details)', null, null, 'unknown', 'n/a', 'n/a', null, 'maybe', 'big', 'basement', 'soon', 'Marathi', null],
];

const terHdr = ['Territory ID', 'City · State', 'Pin codes covered', 'City tier', 'Open slots', 'Priority'];
const ters: unknown[][] = [
  ['TER-01', 'Bengaluru · Karnataka', '560001 / 560008; 560025,560034 560035', 'Tier 1', 2, 'HIGH '],
  ['TER-02', 'Bengaluru · Karnataka', '560038, 560043, 560048, 560066, 560103', 'T1', '2 slots', 'high'],
  ['TER-03', 'bangalore · karnataka', '560076,560078,560085,560100,560061', 'Tier-1', 2, 'med'],
  ['TER-04', 'Mysuru · Karnataka', '570001, 570009, 570017, 570023', 'Tier 2', 1, 'Medium'],
  ['TER-05', 'Mangaluru · Karnataka', '575001, 575002, 575003, 575006', 'Tier 2', 1, 'Medium'],
  ['TER-06', 'Hubballi-Dharwad · Karnataka', '580001, 580020, 580021, 580030', 'Tier 2', 0, 'Medium'],
  ['TER-07', 'Belagavi · Karnataka', '590001, 590002, 590006', 'Tier 2', 1, 'High'],
  ['TER-08', 'Tumakuru · Karnataka', '572101, 572102, 572103', 'Tier 3', 2, 'Low'],
  ['TER-09', 'Davanagere · Karnataka', '577001, 577002, 577004', 'Tier 3', null, 'Medium'],
  ['TER-10', 'Bengaluru · Karnataka', '560008, 560099', 'Tier 1', 1, 'Low'],
  ['TER-11', 'Pune · Maharashtra', '411001, 411002', 'Tier 1', 3, 'High'],
  [null, null, null, null, null, null],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Term', 'Meaning'], ['Catchment', 'Area a store draws customers from'], ['Cannibalisation', 'A new store taking sales from a nearby one']]), 'Glossary');
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([['Franchise applications: Oct export (final v3)'], [], hdr, ...rows]),
  'Applicants (final v3)',
);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([terHdr, ...ters]), 'Territories ');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Store', 'City', 'Pin', 'Opened'], ['ST-01', B, 560001, 2019]]), 'Existing stores');
mkdirSync('test-data', { recursive: true });
XLSX.writeFile(wb, 'test-data/messy-applications.xlsx');
console.log('wrote test-data/messy-applications.xlsx');
