import { google, GoogleApis } from "googleapis";
// const { forEach } = require("lodash");

export interface DocumentData {
    content: string;
    name: string;
    mimeType: string;
    uri: string;
  }

/**
 * Adds the provided tab to the list of all tabs, and recurses through and
 * adds all child tabs.
 */
function addCurrentAndChildTabs(tab: any, allTabs: any []) {
	allTabs.push(tab);

	const tabs = tab?.childTabs || [];

	tabs.forEach((itab: any) => {
			addCurrentAndChildTabs(itab, allTabs);
	});
}

/**
 * Returns a flat list of all tabs in the document in the order they would
 * appear in the UI (top-down ordering). Includes all child tabs.
 */
function getAllTabs(doc: any) {
	let allTabs: any [] = [];
	
	doc.tabs.forEach((tab: any) => {
		addCurrentAndChildTabs(tab, allTabs);
	});
	return allTabs;
}

/**
 * Returns the text in the given ParagraphElement.
 *
 * @param element a ParagraphElement from a Google Doc
 */
function readParagraphElement(element: any) {
	let run = element.textRun;
	if (run == null || run.content == null) {
		// The TextRun can be null if there is an inline object.
		return "";
	}
	return run.content;
}

/**
 * Recurses through a list of Structural Elements to read a document's text where text may be in
 * nested elements.
 *
 * @param elements a list of Structural Elements
 */
function readStructuralElements(elements: any []) {
	let sb = '';
	
	elements.forEach((element: any) => {
			if (element.paragraph != null) {
					element.paragraph.elements.forEach((paragraphElement: any) => {
							sb += readParagraphElement(paragraphElement);
					});
			} else if (element.table != null || element.table != undefined) {
					// The text in table cells are in nested Structural Elements and tables may be
					// nested.
					element.table.tableRows.forEach((row: any) => {
							row.tableCells.forEach((cell: any) => {
									sb += readStructuralElements(cell.content);
							});
					});
			} else if (element.tableOfContents != null || element.tableOfContents != undefined) {
					// The text in the TOC is also in a Structural Element.
					sb += readStructuralElements(element.tableOfContents.content);
			}
	});
			
	return sb;
}


function formatTabs(tabs: any [], elementPosition = 0) {
	let content = '';
	let indexLefText = elementPosition;
	// Print the text from each tab in the document.

	const spaceLeftToText = '\t';
	for (let index = 0; index < tabs.length; index++) {
		const tab = tabs[index];
		const documentTab = tab.documentTab;
		const tabProperties = tab.tabProperties;
		const title = tabProperties?.title;
		let spacesText = spaceLeftToText.repeat(indexLefText);
		
		// content += `${spacesText}seccionName: ${title}\n`;		
		// content += `Sección: ${indentarParrafo(title, spacesText)}\n`;		
		content += `Sección: ${title}\n`;		
		const elements = readStructuralElements(documentTab.body.content);

		indexLefText += 1;
		spacesText = spaceLeftToText.repeat(indexLefText);
		// content += `${spacesText}${elements}\n`;
		content += `${indentarParrafo(elements, spacesText)}\n`;
		// content += `${indentarParrafo(`fin de la seccion: ${title}` , spacesText)}\n\n\n`;
		
		// itero recursivo sobre los tabs hijos
		const childTabs = tab?.childTabs || [];
		if(childTabs.length > 0) {
			// indexLefText += 1;
			// spacesText = spaceLeftToText.repeat(indexLefText);
			// content += `${spacesText} ${formatTabs(childTabs, indexLefText)}\n`;
			indexLefText -= 1
			// spacesText = spaceLeftToText.repeat(indexLefText);
			content += `${indentarParrafo(formatTabs(childTabs, indexLefText), spacesText)}\n`;
			// return content;
		}
		
		// indexLefText -= 1
		// spacesText = spaceLeftToText.repeat(indexLefText);
	}
	return content;
}

function indentarParrafo(parrafo: string, indentacion = '    ') { // Indentación por defecto: 4 espacios
  if (!parrafo) {
    return ''; // Devuelve vacío si el párrafo es nulo o vacío
  }

  // 1. Divide el párrafo en un array de líneas
  const lineas = parrafo.split('\n');

  // 2. Añade la indentación al principio de cada línea
  const lineasIndentadas = lineas.map(linea => {
    // Solo indenta si la línea no está completamente vacía
    // para evitar indentar líneas en blanco entre párrafos si las hubiera.
    // Si quieres indentar *todas* las líneas, incluso las vacías, quita la condición.
    return linea.trim() !== '' ? indentacion + linea : linea;
    // O si quieres indentar absolutamente todas las líneas:
    // return indentacion + linea;
  });

  // 3. Une las líneas de nuevo en un solo string, usando saltos de línea
  return lineasIndentadas.join('\n');
}

/**
 * Find a tab by its ID in a tab hierarchy
 * @param tabs Array of tabs to search through
 * @param tabId ID of the tab to find
 * @returns The found tab or null if not found
 */
function getTabById(tabs: any[], tabId: string): any | null {
  for (const tab of tabs) {
    // Check if the current tab matches
    if (tab.tabProperties?.tabId === tabId) {
      return tab;
    }
    // Recursively search in childTabs, if present
    if (tab.childTabs && tab.childTabs.length > 0) {
      const foundChildTab = getTabById(tab.childTabs, tabId);
      if (foundChildTab) {
        return foundChildTab;
      }
    }
  }
  return null;
}

function contentByTabId(tabs: any[], tabId: string): string {
	const tab = getTabById(tabs, tabId);
	if (tab) {
		return formatTabs([tab]);
	} else {
		return 'No se encontró el tab indicado';
	}
}

export function parseDoc(doc: any): string {
	const tabs = doc.tabs;
	return formatTabs(tabs);

	// const tabid = 't.iqoidhk7d3e6';
	// return contentByTabId(tabs, tabid);
	
	// let content = '';
	// let allTabs = getAllTabs(doc);

	// // Print the text from each tab in the document.
	// allTabs.forEach(tab =>{
	// 	// Get the DocumentTab from the generic Tab.
	// 	let documentTab = tab.documentTab;
	// 	content += readStructuralElements(documentTab.body.content);
	// 	// console.log(
	// 	// 		'contenido del documento parseado: ',
	// 	// 		content);
	// });

	// return content;
}
