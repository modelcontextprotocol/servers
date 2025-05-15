#!/bin/bash

# Script para eliminar todos los servidores MCP excepto gdrive, git y github

cd "$(dirname "$0")/../src"

# Lista de directorios a mantener
keep_dirs=("gdrive" "git" "github")

# Recorrer todos los directorios en src
for dir in */; do
  dir=${dir%/}  # Eliminar la barra final
  
  # Comprobar si el directorio debe mantenerse
  keep=false
  for keep_dir in "${keep_dirs[@]}"; do
    if [ "$dir" = "$keep_dir" ]; then
      keep=true
      break
    fi
  done
  
  # Si no está en la lista de directorios a mantener, eliminarlo
  if [ "$keep" = false ]; then
    echo "Eliminando directorio: $dir"
    rm -rf "$dir"
  else
    echo "Manteniendo directorio: $dir"
  fi
done

echo "Limpieza completada."
