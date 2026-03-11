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

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
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
    - Fecha: 0-8
    - Monto: 8-16
    - DNI: 16-24
    """
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .txt")

    try:
        # Leer el contenido del archivo
        contents = await file.read()
        buffer = io.BytesIO(contents)

        # 2. Definimos las posiciones según el manual del banco
        # Fecha: 0-8, Monto: 8-16, DNI: 16-24
        ancho_columnas = [(0, 8), (8, 16), (16, 24)]
        nombres = ["fecha", "monto_raw", "dni_socio"]

        # 3. Leemos el archivo con Pandas (Fixed Width Format)
        df = pd.read_fwf(buffer, colspecs=ancho_columnas, names=nombres, dtype={"dni_socio": str})

        # Convertimos el monto (ej: 00004500 -> 45.00)
        # Asumimos que los últimos 2 dígitos son decimales
        df["monto"] = df["monto_raw"].astype(float) / 100

        resultados = []
        for _, row in df.iterrows():
            # 4. Registramos el pago en Supabase
            try:
                res = supabase.table("pagos").insert({
                    "dni_socio": str(row["dni_socio"]),
                    "monto": row["monto"],
                    "fecha_pago": str(row["fecha"]),
                    "metodo": "Transferencia Bancaria",
                    "estado": "completado" # Asumimos completado si viene del banco
                }).execute()
                resultados.append({"dni": row["dni_socio"], "status": "success"})
            except Exception as e:
                resultados.append({"dni": row["dni_socio"], "status": "error", "message": str(e)})

        return {
            "message": f"Procesados {len(df)} registros.",
            "detalle": resultados
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando el archivo: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
