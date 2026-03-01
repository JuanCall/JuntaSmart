from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, timedelta
import calendar

# Importamos nuestros archivos locales
import models
from database import engine, SessionLocal

# 1. Crea las tablas en la base de datos SQLite automáticamente
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="API Gestión de Juntas")

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="API Gestión de Juntas")

# --- NUEVO CÓDIGO CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite peticiones desde cualquier origen (ideal para desarrollo local)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# -------------------------

# 2. Definimos los Esquemas (Pydantic) para validar los datos que entran y salen
class ClienteCreate(BaseModel):
    nombre: str
    direccion: Optional[str] = None
    telefono: Optional[str] = None

class ClienteResponse(BaseModel):
    id: int
    nombre: str
    direccion: Optional[str] = None
    telefono: Optional[str] = None

    class Config:
        from_attributes = True # Permite leer los datos directamente del modelo de SQLAlchemy

class JuntaCatalogoCreate(BaseModel):
    monto_objetivo: float
    ganancia: float
    duracion_dias: int

class JuntaCatalogoResponse(BaseModel):
    id: int
    monto_objetivo: float
    ganancia: float
    duracion_dias: int

    class Config:
        from_attributes = True

class JuntaAsignadaCreate(BaseModel):
    cliente_id: int
    junta_catalogo_id: int
    fecha_inicio: date # Formato YYYY-MM-DD

class JuntaAsignadaResponse(BaseModel):
    id: int
    cliente_id: int
    junta_catalogo_id: int
    fecha_inicio: date
    fecha_fin: date
    cuota_diaria: float
    activa: bool

    class Config:
        from_attributes = True

class MovimientoCuentaCreate(BaseModel):
    cliente_id: int
    monto: float
    fecha: date # Le pedimos la fecha por si anota un pago de un día anterior

class MovimientoCuentaResponse(BaseModel):
    id: int
    cliente_id: int
    junta_asignada_id: Optional[int] = None
    fecha: date
    tipo_movimiento: str
    monto: float

    class Config:
        from_attributes = True

# Esquema para recibir todos los datos de un nuevo cliente y su junta al mismo tiempo
class ClienteYJuntaCreate(BaseModel):
    cliente_id: Optional[int] = None # Si envías esto, usa el cliente existente
    nombre_cliente: Optional[str] = None # Si envías esto, crea uno nuevo
    monto_total: float
    cuota_diaria: float
    mes_desembolso_num: int
    mes_inicio: int  
    anio_inicio: int 
    dias_atrasados: int
    opcion_atraso: str

class PagoDetalle(BaseModel):
    junta_asignada_id: int
    monto: float

class PagoMultiCreate(BaseModel):
    cliente_id: int
    fecha: date
    pagos: List[PagoDetalle]

# 3. Dependencia para obtener la sesión de la base de datos por cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 4. Ruta principal de prueba
@app.get("/")
def leer_raiz():
    return {"mensaje": "¡El sistema de la mamá está en línea!"}

# 5. NUEVA RUTA: Crear un cliente
@app.post("/clientes/", response_model=ClienteResponse)
def crear_cliente(cliente: ClienteCreate, db: Session = Depends(get_db)):
    # Creamos el objeto basado en el modelo de SQLAlchemy
    nuevo_cliente = models.Cliente(
        nombre=cliente.nombre, 
        direccion=cliente.direccion, 
        telefono=cliente.telefono
    )
    
    # Lo agregamos a la sesión, guardamos y refrescamos para obtener el ID generado
    db.add(nuevo_cliente)
    db.commit()
    db.refresh(nuevo_cliente)
    
    return nuevo_cliente

# NUEVA RUTA: Listar clientes
@app.get("/clientes/", response_model=list[ClienteResponse])
def obtener_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).all()

# NUEVA RUTA: Crear una opción en el catálogo de juntas
@app.post("/juntas-catalogo/", response_model=JuntaCatalogoResponse)
def crear_junta_catalogo(junta: JuntaCatalogoCreate, db: Session = Depends(get_db)):
    # Usamos **junta.model_dump() como atajo en Python para desempaquetar el diccionario
    # en lugar de escribir monto_objetivo=junta.monto_objetivo, ganancia=..., etc.
    nueva_junta_catalogo = models.JuntaCatalogo(**junta.model_dump())
    
    db.add(nueva_junta_catalogo)
    db.commit()
    db.refresh(nueva_junta_catalogo)
    
    return nueva_junta_catalogo

# NUEVA RUTA: Listar todo el catálogo de juntas
@app.get("/juntas-catalogo/", response_model=list[JuntaCatalogoResponse])
def obtener_juntas_catalogo(db: Session = Depends(get_db)):
    # Retorna todos los registros de la tabla juntas_catalogo
    return db.query(models.JuntaCatalogo).all()

# NUEVA RUTA: Asignar una junta a un cliente
@app.post("/juntas-asignadas/", response_model=JuntaAsignadaResponse)
def asignar_junta(asignacion: JuntaAsignadaCreate, db: Session = Depends(get_db)):
    
    # 1. Buscamos la información del catálogo para hacer los cálculos
    catalogo = db.query(models.JuntaCatalogo).filter(models.JuntaCatalogo.id == asignacion.junta_catalogo_id).first()
    
    if not catalogo:
        raise HTTPException(status_code=404, detail="El tipo de junta no existe en el catálogo.")
        
    # 2. Verificamos que el cliente exista
    cliente = db.query(models.Cliente).filter(models.Cliente.id == asignacion.cliente_id).first()
    
    if not cliente:
        raise HTTPException(status_code=404, detail="El cliente no existe.")

    # 3. Calculamos la cuota diaria
    # Total a pagar = Lo que recibe el cliente (monto_objetivo) + La ganancia de tu mamá
    total_a_pagar = catalogo.monto_objetivo + catalogo.ganancia
    cuota_calculada = total_a_pagar / catalogo.duracion_dias
    
    # 4. Calculamos la fecha de fin (fecha de inicio + los días que dura la junta)
    # timedelta nos permite sumar días a una fecha de manera exacta (considerando años bisiestos, meses de 30/31, etc.)
    fecha_final = asignacion.fecha_inicio + timedelta(days=catalogo.duracion_dias)

    # 5. Creamos el registro en la base de datos
    nueva_junta_asignada = models.JuntaAsignada(
        cliente_id=asignacion.cliente_id,
        junta_catalogo_id=asignacion.junta_catalogo_id,
        fecha_inicio=asignacion.fecha_inicio,
        fecha_fin=fecha_final,
        cuota_diaria=cuota_calculada,
        activa=True
    )
    
    db.add(nueva_junta_asignada)
    db.commit()
    db.refresh(nueva_junta_asignada)
    
    return nueva_junta_asignada

# NUEVA RUTA: Registrar un pago del cliente
@app.post("/movimientos/pago")
def registrar_pago_multiple(datos: PagoMultiCreate, db: Session = Depends(get_db)):
    
    cliente = db.query(models.Cliente).filter(models.Cliente.id == datos.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="El cliente no existe.")

    pagos_registrados = 0
    # Recorremos la lista de pagos de las diferentes juntas
    for pago in datos.pagos:
        if pago.monto > 0: # Solo registramos si le dio plata para esa junta
            nuevo_movimiento = models.MovimientoCuenta(
                cliente_id=datos.cliente_id,
                junta_asignada_id=pago.junta_asignada_id, # Registramos a qué junta fue
                fecha=datos.fecha,
                tipo_movimiento="Pago_Cliente",
                monto=pago.monto  
            )
            db.add(nuevo_movimiento)
            pagos_registrados += 1
    
    db.commit()
    return {"mensaje": f"Se registraron {pagos_registrados} pagos correctamente."}


# NUEVA RUTA: Ver el saldo total (Deuda o a favor) de un cliente
@app.get("/clientes/{cliente_id}/balance")
def obtener_balance(cliente_id: int, db: Session = Depends(get_db)):
    # Verificamos que el cliente exista
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="El cliente no existe.")

    # Sumamos todos los montos de su cuenta corriente (positivos y negativos)
    balance = db.query(func.sum(models.MovimientoCuenta.monto)).filter(
        models.MovimientoCuenta.cliente_id == cliente_id
    ).scalar()

    # Si no tiene movimientos, el balance es 0
    if balance is None:
        balance = 0.0

    return {
        "cliente": cliente.nombre,
        "balance_total": balance
    }

# NUEVA RUTA: El Cobrador Automático (Cierre de día)
@app.post("/procesos/cobro-diario")
def ejecutar_cobro_diario(db: Session = Depends(get_db)):
    hoy = date.today()
    
    # 1. Buscamos todas las juntas que están marcadas como activas
    juntas_activas = db.query(models.JuntaAsignada).filter(models.JuntaAsignada.activa == True).all()
    
    cargos_generados = 0
    
    for junta in juntas_activas:
        # 2. Verificamos que la junta ya haya empezado y aún no termine
        if junta.fecha_inicio <= hoy <= junta.fecha_fin:
            
            # 3. SEGURIDAD: Verificamos que no le hayamos cobrado ya el día de hoy
            # (Por si tu mamá presiona el botón "Cerrar Día" dos veces por error)
            ya_cobrado = db.query(models.MovimientoCuenta).filter(
                models.MovimientoCuenta.cliente_id == junta.cliente_id,
                models.MovimientoCuenta.fecha == hoy,
                models.MovimientoCuenta.tipo_movimiento == "Cargo_Diario"
            ).first()
            
            # 4. Si no se le ha cobrado hoy, le generamos la deuda diaria
            if not ya_cobrado:
                cargo = models.MovimientoCuenta(
                    cliente_id=junta.cliente_id,
                    junta_asignada_id=junta.id,
                    fecha=hoy,
                    tipo_movimiento="Cargo_Diario",
                    monto=-junta.cuota_diaria  # ¡OJO! El monto es NEGATIVO porque es una deuda
                )
                db.add(cargo)
                cargos_generados += 1
                
    # 5. Guardamos todos los cambios en la base de datos de un solo golpe
    db.commit()
    
    return {
        "mensaje": f"Cierre de día completado.",
        "fecha": hoy,
        "cargos_generados": cargos_generados
    }

# NUEVA RUTA: Crear Cliente y Junta Personalizada de un solo golpe
@app.post("/clientes/nueva-junta")
def crear_cliente_y_junta(datos: ClienteYJuntaCreate, db: Session = Depends(get_db)):
    
    # 1. Lógica para Cliente (Usar existente o crear nuevo)
    if datos.cliente_id:
        cliente = db.query(models.Cliente).filter(models.Cliente.id == datos.cliente_id).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
    else:
        cliente = models.Cliente(nombre=datos.nombre_cliente)
        db.add(cliente)
        db.flush() # Obtenemos el ID nuevo

    # 2. Catálogo (igual que antes)
    catalogo = db.query(models.JuntaCatalogo).filter(
        models.JuntaCatalogo.monto_objetivo == datos.monto_total,
        models.JuntaCatalogo.duracion_dias == 150
    ).first()

    if not catalogo:
        catalogo = models.JuntaCatalogo(monto_objetivo=datos.monto_total, ganancia=0, duracion_dias=150)
        db.add(catalogo)
        db.flush()

    # 3. Fechas (igual que antes)
    fecha_inicio = date(datos.anio_inicio, datos.mes_inicio, 1)
    mes_final_calc = (datos.mes_inicio + 4 - 1) % 12 + 1
    anio_final_calc = datos.anio_inicio + (datos.mes_inicio + 4 - 1) // 12
    dia_final = calendar.monthrange(anio_final_calc, mes_final_calc)[1]
    fecha_fin = date(anio_final_calc, mes_final_calc, dia_final)

    delta_desembolso = datos.mes_desembolso_num - 1
    mes_des_calc = (datos.mes_inicio + delta_desembolso - 1) % 12 + 1
    anio_des_calc = datos.anio_inicio + (datos.mes_inicio + delta_desembolso - 1) // 12
    dia_des = calendar.monthrange(anio_des_calc, mes_des_calc)[1]
    fecha_desembolso = date(anio_des_calc, mes_des_calc, dia_des)

    monto_final_a_entregar = datos.monto_total
    
    # 4. Asignar Junta
    nueva_junta = models.JuntaAsignada(
        cliente_id=cliente.id,
        junta_catalogo_id=catalogo.id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        fecha_desembolso=fecha_desembolso,
        monto_a_entregar=monto_final_a_entregar,
        cuota_diaria=datos.cuota_diaria,
        mes_desembolso_num=datos.mes_desembolso_num,
        activa=True
    )
    db.add(nueva_junta)
    db.flush() # Obtenemos el ID de la junta para usarlo en la deuda inicial si aplica

    # 5. Lógica de Rezagados
    if datos.dias_atrasados > 0:
        if datos.opcion_atraso == "descuento":
            nueva_junta.monto_a_entregar = datos.monto_total - (datos.cuota_diaria * datos.dias_atrasados)
        elif datos.opcion_atraso == "al_dia":
            deuda_inicial = models.MovimientoCuenta(
                cliente_id=cliente.id,
                junta_asignada_id=nueva_junta.id, # Asignamos la deuda a ESTA junta
                fecha=date.today(),
                tipo_movimiento="Deuda_Por_Retraso",
                monto=-(datos.cuota_diaria * datos.dias_atrasados)
            )
            db.add(deuda_inicial)

    db.commit()
    return {"mensaje": "Trato guardado", "cliente_id": cliente.id}

# NUEVA RUTA: Obtener las juntas activas de un cliente
@app.get("/clientes/{cliente_id}/juntas")
def obtener_juntas_cliente(cliente_id: int, db: Session = Depends(get_db)):
    juntas = db.query(models.JuntaAsignada).filter(
        models.JuntaAsignada.cliente_id == cliente_id,
        models.JuntaAsignada.activa == True
    ).all()
    return juntas

# NUEVA RUTA: Obtener el historial de movimientos de un cliente
@app.get("/clientes/{cliente_id}/movimientos")
def obtener_movimientos_cliente(cliente_id: int, db: Session = Depends(get_db)):
    movimientos = db.query(models.MovimientoCuenta).filter(
        models.MovimientoCuenta.cliente_id == cliente_id
    ).order_by(models.MovimientoCuenta.fecha.desc()).all()
    return movimientos

