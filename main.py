import os
import io
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment")

supabase: Client = create_client(URL, KEY)

app = FastAPI(title="Sociedad Rural Backend - Procesamiento de Pagos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "online", "message": "Backend para procesamiento de archivos de banco"}


@app.post("/procesar-pagos")
async def procesar_archivo_banco(file: UploadFile = File(...)):
    """
    Recibe un archivo con formato de ancho fijo (FWF) del banco y lo procesa.
    Formato esperado:
    - Fecha: 0-8   (ej: 20240311)
    - Monto: 8-16  (ej: 00004500 → $45.00)
    - DNI:   16-24
    """
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .txt")

    try:
        contents = await file.read()
        buffer = io.BytesIO(contents)

        ancho_columnas = [(0, 8), (8, 16), (16, 24)]
        nombres = ["fecha", "monto_raw", "dni_socio"]

        df = pd.read_fwf(buffer, colspecs=ancho_columnas, names=nombres, dtype={"dni_socio": str, "fecha": str})

        # Convertimos el monto: 00004500 → 45.00
        df["monto"] = df["monto_raw"].astype(float) / 100

        resultados = []
        for _, row in df.iterrows():
            dni = str(row["dni_socio"]).strip()
            monto = row["monto"]
            fecha_raw = str(row["fecha"]).strip()

            # Convertir fecha de formato AAAAMMDD → AAAA-MM-DD
            try:
                fecha_vencimiento = f"{fecha_raw[0:4]}-{fecha_raw[4:6]}-{fecha_raw[6:8]}"
            except Exception:
                fecha_vencimiento = fecha_raw

            # Buscar el UUID del socio por DNI en la tabla profiles
            try:
                perfil = supabase.table("profiles").select("id").eq("dni", dni).single().execute()
                socio_id = perfil.data["id"]
            except Exception:
                resultados.append({
                    "dni": dni,
                    "status": "error",
                    "message": f"Socio con DNI {dni} no encontrado en la base de datos."
                })
                continue

            # Insertar el pago en pagos_cuotas
            try:
                supabase.table("pagos_cuotas").insert({
                    "socio_id": socio_id,
                    "monto": monto,
                    "fecha_vencimiento": fecha_vencimiento,
                    "estado_pago": "PAGADO",
                }).execute()
                resultados.append({"dni": dni, "socio_id": socio_id, "status": "success"})
            except Exception as e:
                resultados.append({"dni": dni, "status": "error", "message": str(e)})

        exitos = sum(1 for r in resultados if r["status"] == "success")
        return {
            "message": f"Procesados {len(df)} registros. {exitos} insertados correctamente.",
            "detalle": resultados
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando el archivo: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
