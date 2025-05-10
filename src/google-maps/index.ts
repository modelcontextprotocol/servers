#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// Response interfaces
interface GoogleMapsResponse {
  status: string;
  error_message?: string;
}

interface GeocodeResponse extends GoogleMapsResponse {
  results: Array<{
    place_id: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      }
    };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
}

interface PlacesSearchResponse {
  places: Array<{
    id: string;
    displayName: {
      text: string;
    };
    formattedAddress: string;
    location: {
      latitude: number;
      longitude: number;
    };
    rating?: number;
    types: string[];
  }>;
}

// Extended interface for the Places API (New) response
interface PlaceDetailsResponse {
  name: string;
  id: string;
  displayName: {
    text: string;
    languageCode?: string;
  };
  primaryType?: string;
  types?: string[];
  primaryTypeDisplayName?: {
    text: string;
    languageCode?: string;
  };
  formattedAddress: string;
  shortFormattedAddress?: string;
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
    languageCode?: string;
  }>;
  plusCode?: {
    globalCode: string;
    compoundCode: string;
  };
  location: {
    latitude: number;
    longitude: number;
  };
  viewport?: {
    low: {
      latitude: number;
      longitude: number;
    };
    high: {
      latitude: number;
      longitude: number;
    };
  };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  reviews?: Array<{
    name: string;
    relativePublishTimeDescription?: string;
    text: {
      text: string;
      languageCode?: string;
    };
    originalText?: {
      text: string;
      languageCode?: string;
    };
    rating: number;
    authorAttribution: {
      displayName: string;
      uri?: string;
      photoUri?: string;
    };
    publishTime: string;
    flagContentUri?: string;
    googleMapsUri?: string;
  }>;
  regularOpeningHours?: {
    openNow: boolean;
    periods?: Array<{
      open?: {
        day: number;
        hour: number;
        minute: number;
      };
      close?: {
        day: number;
        hour: number;
        minute: number;
      };
    }>;
    weekdayDescriptions: string[];
    secondaryHoursType?: string;
    nextOpenTime?: string;
    nextCloseTime?: string;
  };
  currentOpeningHours?: {
    openNow: boolean;
    periods?: Array<{
      open?: {
        day: number;
        hour: number;
        minute: number;
      };
      close?: {
        day: number;
        hour: number;
        minute: number;
      };
    }>;
    weekdayDescriptions: string[];
    secondaryHoursType?: string;
    nextOpenTime?: string;
    nextCloseTime?: string;
  };
  photos?: Array<{
    name: string;
    widthPx: number;
    heightPx: number;
    authorAttributions: Array<{
      displayName: string;
      uri?: string;
      photoUri?: string;
    }>;
    flagContentUri?: string;
    googleMapsUri?: string;
  }>;
  editorialSummary?: {
    text: string;
    languageCode?: string;
  };
  businessStatus?: string;
  priceLevel?: string;
  iconMaskBaseUri?: string;
  iconBackgroundColor?: string;
  // Additional attributes
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  reservable?: boolean;
  curbsidePickup?: boolean;
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesBrunch?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesCocktails?: boolean;
  servesVegetarianFood?: boolean;
  servesCoffee?: boolean;
  servesDessert?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  menuForChildren?: boolean;
  goodForChildren?: boolean;
  allowsDogs?: boolean;
  restroom?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
}

interface RouteMatrixResponse {
  originIndex: number;
  destinationIndex: number;
  status: string;
  distanceMeters: number;
  duration: string;
}

interface ElevationResponse extends GoogleMapsResponse {
  results: Array<{
    elevation: number;
    location: {
      lat: number;
      lng: number;
    };
    resolution: number;
  }>;
}

interface DirectionsResponse {
  routes: Array<{
    description?: string;
    distanceMeters: number;
    duration: string;
    staticDuration: string;
    legs: Array<{
      steps: Array<{
        distanceMeters: number;
        staticDuration: string;
        navigationInstruction?: {
          instructions: string;
        };
        travelAdvisory?: {
          text?: {
            text: string;
          };
        };
      }>;
    }>;
  }>;
}

function getApiKey(): string {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY environment variable is not set");
      process.exit(1);
    }
    return apiKey;
  }

const GOOGLE_MAPS_API_KEY = getApiKey();

// Tool definitions
const GEOCODE_TOOL: Tool = {
    name: "maps_geocode",
    description: "Convert an address into geographic coordinates",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The address to geocode"
        }
      },
      required: ["address"]
    }
  };

const REVERSE_GEOCODE_TOOL: Tool = {
  name: "maps_reverse_geocode",
  description: "Convert coordinates into an address",
  inputSchema: {
    type: "object",
    properties: {
      latitude: {
        type: "number",
        description: "Latitude coordinate"
      },
      longitude: {
        type: "number",
        description: "Longitude coordinate"
      }
    },
    required: ["latitude", "longitude"]
  }
};

const SEARCH_PLACES_TOOL: Tool = {
  name: "maps_search_places",
  description: "Search for places using Google Places API",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query"
      },
      location: {
        type: "object",
        properties: {
          latitude: { type: "number" },
          longitude: { type: "number" }
        },
        description: "Optional center point for the search"
      },
      radius: {
        type: "number",
        description: "Search radius in meters (max 50000)"
      }
    },
    required: ["query"]
  }
};

const PLACE_DETAILS_TOOL: Tool = {
  name: "maps_place_details",
  description: "Get detailed information about a specific place",
  inputSchema: {
    type: "object",
    properties: {
      place_id: {
        type: "string",
        description: "The place ID to get details for"
      }
    },
    required: ["place_id"]
  }
};

const DISTANCE_MATRIX_TOOL: Tool = {
  name: "maps_distance_matrix",
  description: "Calculate travel distance and time for multiple origins and destinations",
  inputSchema: {
    type: "object",
    properties: {
      origins: {
        type: "array",
        items: { type: "string" },
        description: "Array of origin addresses or coordinates"
      },
      destinations: {
        type: "array",
        items: { type: "string" },
        description: "Array of destination addresses or coordinates"
      },
      mode: {
        type: "string",
        description: "Travel mode (driving, walking, bicycling, transit, two_wheeler)",
        enum: ["driving", "walking", "bicycling", "transit", "two_wheeler"]
      }
    },
    required: ["origins", "destinations"]
  }
};

const ELEVATION_TOOL: Tool = {
  name: "maps_elevation",
  description: "Get elevation data for locations on the earth",
  inputSchema: {
    type: "object",
    properties: {
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" }
          },
          required: ["latitude", "longitude"]
        },
        description: "Array of locations to get elevation for"
      }
    },
    required: ["locations"]
  }
};

const DIRECTIONS_TOOL: Tool = {
  name: "maps_directions",
  description: "Get directions between two points",
  inputSchema: {
    type: "object",
    properties: {
      origin: {
        type: "string",
        description: "Starting point address or coordinates"
      },
      destination: {
        type: "string",
        description: "Ending point address or coordinates"
      },
      mode: {
        type: "string",
        description: "Travel mode (driving, walking, bicycling, transit, two_wheeler)",
        enum: ["driving", "walking", "bicycling", "transit", "two_wheeler"]
      }
    },
    required: ["origin", "destination"]
  }
};

const MAPS_TOOLS = [
  GEOCODE_TOOL,
  REVERSE_GEOCODE_TOOL,
  SEARCH_PLACES_TOOL,
  PLACE_DETAILS_TOOL,
  DISTANCE_MATRIX_TOOL,
  ELEVATION_TOOL,
  DIRECTIONS_TOOL,
] as const;

// Helper function to convert price level string to numeric value
function getPriceLevelValue(priceLevel: string): number {
  const priceLevelMap: Record<string, number> = {
    "PRICE_LEVEL_FREE": 0,
    "PRICE_LEVEL_INEXPENSIVE": 1,
    "PRICE_LEVEL_MODERATE": 2,
    "PRICE_LEVEL_EXPENSIVE": 3,
    "PRICE_LEVEL_VERY_EXPENSIVE": 4
  };
  
  return priceLevelMap[priceLevel] ?? 0; // Use nullish coalescing for fallback
}

// API handlers
async function handleGeocode(address: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("address", address);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as GeocodeResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text",
        text: `Geocoding failed: ${data.error_message || data.status}`
      }],
      isError: true
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        location: data.results[0].geometry.location,
        formatted_address: data.results[0].formatted_address,
        place_id: data.results[0].place_id
      }, null, 2)
    }],
    isError: false
  };
}

async function handleReverseGeocode(latitude: number, longitude: number) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("latlng", `${latitude},${longitude}`);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as GeocodeResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text",
        text: `Reverse geocoding failed: ${data.error_message || data.status}`
      }],
      isError: true
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        formatted_address: data.results[0].formatted_address,
        place_id: data.results[0].place_id,
        address_components: data.results[0].address_components
      }, null, 2)
    }],
    isError: false
  };
}

async function handlePlaceSearch(
  query: string,
  location?: { latitude: number; longitude: number },
  radius?: number
) {
  const url = new URL("https://places.googleapis.com/v1/places:searchText");
  
  // Build request body
  const requestBody: any = {
    textQuery: query
  };
  
  // Add location bias if provided
  if (location && radius) {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: location.latitude,
          longitude: location.longitude
        },
        radius: radius
      }
    };
  }
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.id,places.rating,places.types'
    },
    body: JSON.stringify(requestBody)
  });
  
  const data = await response.json() as {
    places?: Array<any>;
    error?: { message?: string };
  };
  
  if (!data.places) {
    return {
      content: [{
        type: "text",
        text: `Place search failed: ${data.error?.message || 'Unknown error'}`
      }],
      isError: true
    };
  }
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        places: data.places.map((place: any) => ({
          name: place.displayName?.text,
          formatted_address: place.formattedAddress,
          location: {
            lat: place.location?.latitude,
            lng: place.location?.longitude
          },
          place_id: place.id,
          rating: place.rating,
          types: place.types
        }))
      }, null, 2)
    }],
    isError: false
  };
}

async function handlePlaceDetails(place_id: string) {
  const url = new URL(`https://places.googleapis.com/v1/places/${place_id}`);
  
  // Extensive field mask to get all relevant place details
  const fieldMask = [
    'name', 'id', 'displayName', 'types', 'primaryType', 
    'primaryTypeDisplayName', 'formattedAddress', 'shortFormattedAddress',
    'addressComponents', 'nationalPhoneNumber', 'internationalPhoneNumber', 
    'location', 'viewport', 'rating', 'userRatingCount', 'googleMapsUri', 
    'websiteUri', 'regularOpeningHours', 'currentOpeningHours', 
    'photos', 'businessStatus', 'priceLevel', 'reviews',
    'paymentOptions', 'accessibilityOptions', 'reservable', 
    'dineIn', 'takeout', 'delivery', 'servesBreakfast', 'servesLunch', 
    'servesDinner', 'servesBrunch', 'editorialSummary', 'plusCode',
    'iconMaskBaseUri', 'iconBackgroundColor'
  ].join(',');

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': fieldMask
      }
    });
    
    console.error(`Place details response status: ${response.status}`);
    
    if (!response.ok) {
      // Try to get detailed error information
      let errorDetails = "";
      try {
        const errorText = await response.text();
        errorDetails = errorText.substring(0, 200);
        console.error(`Error response body: ${errorText}`);
      } catch (e) {
        errorDetails = "Could not read error details";
      }
      
      return {
        content: [{
          type: "text",
          text: `Place details request failed: HTTP ${response.status} - ${response.statusText}\nDetails: ${errorDetails}`
        }],
        isError: true
      };
    }
    
    const placeData = await response.json() as any;
    
    // Transform the response to a structured format matching our expected client format
    const formattedData = {
      name: placeData.displayName?.text || '',
      place_id: placeData.id,
      formatted_address: placeData.formattedAddress || '',
      formatted_phone_number: placeData.nationalPhoneNumber || '',
      international_phone_number: placeData.internationalPhoneNumber || '',
      website: placeData.websiteUri || '',
      rating: placeData.rating || 0,
      user_ratings_total: placeData.userRatingCount || 0,
      url: placeData.googleMapsUri || '',
      address_components: placeData.addressComponents || [],
      geometry: {
        location: placeData.location ? {
          lat: placeData.location.latitude,
          lng: placeData.location.longitude
        } : null,
        viewport: placeData.viewport ? {
          northeast: {
            lat: placeData.viewport.high.latitude,
            lng: placeData.viewport.high.longitude
          },
          southwest: {
            lat: placeData.viewport.low.latitude,
            lng: placeData.viewport.low.longitude
          }
        } : null
      },
      types: placeData.types || [],
      primary_type: placeData.primaryType || '',
      editorial_summary: placeData.editorialSummary?.text || '',
      icon: placeData.iconMaskBaseUri || '',
      icon_background_color: placeData.iconBackgroundColor || '',
      plus_code: placeData.plusCode ? {
        global_code: placeData.plusCode.globalCode,
        compound_code: placeData.plusCode.compoundCode
      } : null,
      business_status: placeData.businessStatus || '',
      price_level: placeData.priceLevel ? getPriceLevelValue(placeData.priceLevel) : 0,
      opening_hours: placeData.regularOpeningHours ? {
        open_now: placeData.regularOpeningHours.openNow,
        weekday_text: placeData.regularOpeningHours.weekdayDescriptions,
        periods: placeData.regularOpeningHours.periods?.map((period: any) => ({
          open: {
            day: period.open?.day,
            time: `${String(period.open?.hour).padStart(2, '0')}${String(period.open?.minute).padStart(2, '0')}`
          },
          close: period.close ? {
            day: period.close.day,
            time: `${String(period.close.hour).padStart(2, '0')}${String(period.close.minute).padStart(2, '0')}`
          } : null
        })) || []
      } : null,
      current_opening_hours: placeData.currentOpeningHours ? {
        open_now: placeData.currentOpeningHours.openNow,
        weekday_text: placeData.currentOpeningHours.weekdayDescriptions
      } : null,
      reviews: placeData.reviews?.map((review: any) => ({
        author_name: review.authorAttribution?.displayName || '',
        author_url: review.authorAttribution?.uri || '',
        profile_photo_url: review.authorAttribution?.photoUri || '',
        rating: review.rating || 0,
        relative_time_description: review.relativePublishTimeDescription || '',
        text: review.text?.text || '',
        time: review.publishTime || '',
        google_maps_uri: review.googleMapsUri || ''
      })) || [],
      photos: placeData.photos?.map((photo: any) => ({
        photo_reference: photo.name.replace('places/', '').replace(/\/photos\/.*/, ''),
        height: photo.heightPx,
        width: photo.widthPx,
        html_attributions: photo.authorAttributions?.map((attr: any) => 
          `<a href="${attr.uri}">${attr.displayName}</a>`) || []
      })) || [],
      // Additional attributes
      dine_in: placeData.dineIn || false,
      takeout: placeData.takeout || false,
      delivery: placeData.delivery || false,
      reservable: placeData.reservable || false,
      serves_breakfast: placeData.servesBreakfast || false,
      serves_lunch: placeData.servesLunch || false,
      serves_dinner: placeData.servesDinner || false,
      serves_brunch: placeData.servesBrunch || false,
      payment_options: placeData.paymentOptions ? {
        accepts_credit_cards: placeData.paymentOptions.acceptsCreditCards || false,
        accepts_debit_cards: placeData.paymentOptions.acceptsDebitCards || false,
        accepts_cash_only: placeData.paymentOptions.acceptsCashOnly || false,
        accepts_nfc: placeData.paymentOptions.acceptsNfc || false
      } : {},
      accessibility_options: placeData.accessibilityOptions ? {
        wheelchair_accessible_entrance: placeData.accessibilityOptions.wheelchairAccessibleEntrance || false,
        wheelchair_accessible_parking: placeData.accessibilityOptions.wheelchairAccessibleParking || false,
        wheelchair_accessible_restroom: placeData.accessibilityOptions.wheelchairAccessibleRestroom || false,
        wheelchair_accessible_seating: placeData.accessibilityOptions.wheelchairAccessibleSeating || false
      } : {}
    };
    
    // Return the formatted data
    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedData, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    console.error('Place details error:', error);
    return {
      content: [{
        type: "text",
        text: `Place details request failed: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

async function handleDistanceMatrix(
  origins: string[],
  destinations: string[],
  mode: "driving" | "walking" | "bicycling" | "transit" | "two_wheeler" = "driving"
) {
  const url = new URL("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix");
  
  // Map MCP travel modes to Google Routes API travel modes
  const travelModeMap: Record<string, string> = {
    "driving": "DRIVE",
    "walking": "WALK",
    "bicycling": "BICYCLE",
    "transit": "TRANSIT",
    "two_wheeler": "TWO_WHEELER" // Added TWO_WHEELER support
  };
  
  const googleTravelMode = travelModeMap[mode] || "DRIVE";
  
  // Determine if inputs are coordinates or addresses
  const coordRegex = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
  
  const originInputs = origins.map(origin => {
    if (coordRegex.test(origin)) {
      const [lat, lng] = origin.split(',').map(Number);
      return {
        waypoint: {
          location: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      };
    } else {
      return {
        waypoint: {
          address: origin
        }
      };
    }
  });
  
  const destinationInputs = destinations.map(destination => {
    if (coordRegex.test(destination)) {
      const [lat, lng] = destination.split(',').map(Number);
      return {
        waypoint: {
          location: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      };
    } else {
      return {
        waypoint: {
          address: destination
        }
      };
    }
  });
  
  // Create base request body without routingPreference
  const requestBody: any = {
    origins: originInputs,
    destinations: destinationInputs,
    travelMode: googleTravelMode
  };
  
  // Only include routingPreference for DRIVE or TWO_WHEELER modes
  // According to Routes API documentation, routingPreference can only be used with these modes
  if (googleTravelMode === "DRIVE" || googleTravelMode === "TWO_WHEELER") {
    requestBody.routingPreference = "TRAFFIC_AWARE";
  }
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,status,distanceMeters,duration'
    },
    body: JSON.stringify(requestBody)
  });
  
  // Add explicit type casting here
  const data = await response.json() as Array<{
    originIndex?: number;
    destinationIndex?: number;
    status?: string;
    duration?: string;
    distanceMeters?: number;
    error?: { message?: string };
  }>;
  
  if (response.status !== 200 || (data[0] && data[0].error)) {
    return {
      content: [{
        type: "text",
        text: `Distance matrix request failed: ${data[0]?.error?.message || response.statusText || 'Unknown error'}`
      }],
      isError: true
    };
  }
  
  // Reshape route matrix into legacy format
  const resultMatrix = Array(origins.length).fill(null).map(() => ({
    elements: Array(destinations.length).fill(null)
  }));
  
  // Process each result in the matrix
  data.forEach((item: any) => {
    const originIdx = item.originIndex;
    const destIdx = item.destinationIndex;
    
    resultMatrix[originIdx].elements[destIdx] = {
      status: item.status || "OK",
      duration: {
        text: item.duration ? item.duration.replace('s', '') : 'Unknown',
        value: item.distanceMeters ? parseInt(item.duration.replace('s', '')) : 0
      },
      distance: {
        text: item.distanceMeters ? `${(item.distanceMeters / 1000).toFixed(1)} km` : 'Unknown',
        value: item.distanceMeters
      }
    };
  });
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        origin_addresses: origins,
        destination_addresses: destinations,
        rows: resultMatrix
      }, null, 2)
    }],
    isError: false
  };
}  

async function handleElevation(locations: Array<{ latitude: number; longitude: number }>) {
  const url = new URL("https://maps.googleapis.com/maps/api/elevation/json");
  const locationString = locations
    .map((loc) => `${loc.latitude},${loc.longitude}`)
    .join("|");
  url.searchParams.append("locations", locationString);
  url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as ElevationResponse;

  if (data.status !== "OK") {
    return {
      content: [{
        type: "text",
        text: `Elevation request failed: ${data.error_message || data.status}`
      }],
      isError: true
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        results: data.results.map((result) => ({
          elevation: result.elevation,
          location: result.location,
          resolution: result.resolution
        }))
      }, null, 2)
    }],
    isError: false
  };
}

async function handleDirections(
  origin: string,
  destination: string,
  mode: "driving" | "walking" | "bicycling" | "transit" | "two_wheeler" = "driving"
) {
  const url = new URL("https://routes.googleapis.com/directions/v2:computeRoutes");
  
  // Map MCP travel modes to Google Routes API travel modes
  const travelModeMap: Record<string, string> = {
    "driving": "DRIVE",
    "walking": "WALK",
    "bicycling": "BICYCLE",
    "transit": "TRANSIT",
    "two_wheeler": "TWO_WHEELER" // Added TWO_WHEELER support
  };
  
  const googleTravelMode = travelModeMap[mode] || "DRIVE";
  
  // Determine if inputs are coordinates or addresses
  let originInput: any = {};
  let destinationInput: any = {};
  
  // Simple regex to detect if input might be coordinates
  const coordRegex = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
  
  if (coordRegex.test(origin)) {
    const [lat, lng] = origin.split(',').map(Number);
    originInput = {
      location: {
        latLng: {
          latitude: lat,
          longitude: lng
        }
      }
    };
  } else {
    originInput = { address: origin };
  }
  
  if (coordRegex.test(destination)) {
    const [lat, lng] = destination.split(',').map(Number);
    destinationInput = {
      location: {
        latLng: {
          latitude: lat,
          longitude: lng
        }
      }
    };
  } else {
    destinationInput = { address: destination };
  }
  
  // Create base request body without routingPreference
  const requestBody: any = {
    origin: originInput,
    destination: destinationInput,
    travelMode: googleTravelMode,
    computeAlternativeRoutes: false,
    routeModifiers: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: false
    },
    languageCode: "en-US"
  };
  
  // Only include routingPreference for DRIVE or TWO_WHEELER modes
  // According to Routes API documentation, routingPreference can only be used with these modes
  if (googleTravelMode === "DRIVE" || googleTravelMode === "TWO_WHEELER") {
    requestBody.routingPreference = "TRAFFIC_AWARE";
  }
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.description,routes.distanceMeters,routes.duration,routes.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.navigationInstruction,routes.legs.steps.travelAdvisory'
    },
    body: JSON.stringify(requestBody)
  });
  
  // Add explicit type casting here
  const data = await response.json() as {
    routes?: Array<any>;
    error?: { message?: string };
  };
  
  if (response.status !== 200 || data.error) {
    return {
      content: [{
        type: "text",
        text: `Directions request failed: ${data.error?.message || response.statusText || 'No routes found'}`
      }],
      isError: true
    };
  }
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        routes: data.routes?.map((route: any) => ({
          summary: route.description || 'Route',
          distance: {
            text: route.distanceMeters ? `${(route.distanceMeters / 1000).toFixed(1)} km` : 'Unknown distance',
            value: route.distanceMeters
          },
          duration: {
            text: route.duration ? route.duration.replace('s', '') : 'Unknown duration',
            value: route.staticDuration ? parseInt(route.staticDuration.replace('s', '')) : 0
          },
          steps: route.legs?.[0]?.steps?.map((step: any) => ({
            instructions: step.navigationInstruction?.instructions || step.travelAdvisory?.text?.text || '',
            distance: {
              text: step.distanceMeters ? `${(step.distanceMeters / 1000).toFixed(1)} km` : 'Unknown distance',
              value: step.distanceMeters
            },
            duration: {
              text: step.staticDuration ? step.staticDuration.replace('s', '') : 'Unknown duration',
              value: step.staticDuration ? parseInt(step.staticDuration.replace('s', '')) : 0
            },
            travel_mode: googleTravelMode
          })) || []
        })) || []
      }, null, 2)
    }],
    isError: false
  };
} 

// Server setup
const server = new Server(
  {
    name: "mcp-server/google-maps",
    version: "0.1.0.leependu",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: MAPS_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "maps_geocode": {
        const { address } = request.params.arguments as { address: string };
        return await handleGeocode(address);
      }

      case "maps_reverse_geocode": {
        const { latitude, longitude } = request.params.arguments as {
          latitude: number;
          longitude: number;
        };
        return await handleReverseGeocode(latitude, longitude);
      }

      case "maps_search_places": {
        const { query, location, radius } = request.params.arguments as {
          query: string;
          location?: { latitude: number; longitude: number };
          radius?: number;
        };
        return await handlePlaceSearch(query, location, radius);
      }

      case "maps_place_details": {
        const { place_id } = request.params.arguments as { place_id: string };
        return await handlePlaceDetails(place_id);
      }

      case "maps_distance_matrix": {
        const { origins, destinations, mode } = request.params.arguments as {
          origins: string[];
          destinations: string[];
          mode?: "driving" | "walking" | "bicycling" | "transit" | "two_wheeler";
        };
        return await handleDistanceMatrix(origins, destinations, mode);
      }

      case "maps_elevation": {
        const { locations } = request.params.arguments as {
          locations: Array<{ latitude: number; longitude: number }>;
        };
        return await handleElevation(locations);
      }

      case "maps_directions": {
        const { origin, destination, mode } = request.params.arguments as {
          origin: string;
          destination: string;
          mode?: "driving" | "walking" | "bicycling" | "transit" | "two_wheeler";
        };
        return await handleDirections(origin, destination, mode);
      }

      default:
        return {
          content: [{
            type: "text",
            text: `Unknown tool: ${request.params.name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Maps MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
