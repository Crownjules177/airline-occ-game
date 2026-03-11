export const AIRCRAFT_TYPES = [
  { type: 'B737', name: 'Boeing 737-800', shortName: '738' },
  { type: 'B738', name: 'Boeing 737 MAX 8', shortName: 'M8' },
  { type: 'A320', name: 'Airbus A320neo', shortName: '32N' },
  { type: 'A321', name: 'Airbus A321neo', shortName: '21N' },
  { type: 'B757', name: 'Boeing 757-200', shortName: '752' },
  { type: 'A319', name: 'Airbus A319', shortName: '319' },
  { type: 'E175', name: 'Embraer E175', shortName: 'E75' },
  { type: 'B739', name: 'Boeing 737-900ER', shortName: '739' },
];

export function getRandomAircraft() {
  return AIRCRAFT_TYPES[Math.floor(Math.random() * AIRCRAFT_TYPES.length)];
}
