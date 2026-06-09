// models/prioridadModel.js
// ms-prioridad - Modelo de clasificación de prioridad de alertas
// Sistema C5 - Alerta Ciudadana

'use strict';

/**
 * Reglas de negocio para clasificación de prioridad.
 * Configurable: modificar estas reglas sin tocar index.js.
 */
const REGLAS_PRIORIDAD = {
  critica: ['incendio', 'accidente grave', 'emergencia médica', 'panico'],
  alta: ['robo', 'asalto', 'violencia'],
  media: ['actividad sospechosa', 'vandalismo', 'otro'],
};

/**
 * Niveles de prioridad en orden de urgencia (mayor a menor).
 */
const NIVELES = ['crítica', 'alta', 'media'];

/**
 * Asigna un nivel de prioridad dado el tipo de emergencia.
 * @param {string} tipoEmergencia
 * @returns {'crítica' | 'alta' | 'media'}
 */
function asignarPrioridad(tipoEmergencia) {
  const tipo = (tipoEmergencia || '').toLowerCase().trim();

  if (REGLAS_PRIORIDAD.critica.includes(tipo)) return 'crítica';
  if (REGLAS_PRIORIDAD.alta.includes(tipo)) return 'alta';
  if (REGLAS_PRIORIDAD.media.includes(tipo)) return 'media';

  // Default: media para tipos desconocidos
  console.warn(`[Prioridad] Tipo desconocido: '${tipo}'. Se asigna prioridad 'media'.`);
  return 'media';
}

/**
 * Enriquece una alerta con su nivel de prioridad calculado.
 * @param {Object} alerta
 * @returns {Object} alerta con campo `prioridad` agregado
 */
function priorizarAlerta(alerta) {
  const prioridad = asignarPrioridad(alerta.tipo_emergencia);
  return { ...alerta, prioridad };
}

module.exports = { asignarPrioridad, priorizarAlerta, REGLAS_PRIORIDAD, NIVELES };
