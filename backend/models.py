# models.py
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, Boolean
from sqlalchemy.orm import relationship
from database import Base

class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, index=True)
    direccion = Column(String, nullable=True)
    telefono = Column(String, nullable=True)

    # Relaciones para acceder fácilmente a sus datos desde Python
    juntas = relationship("JuntaAsignada", back_populates="cliente")
    movimientos = relationship("MovimientoCuenta", back_populates="cliente")

class JuntaCatalogo(Base):
    __tablename__ = "juntas_catalogo"

    id = Column(Integer, primary_key=True, index=True)
    monto_objetivo = Column(Float)  # Ej: 5000
    ganancia = Column(Float)        # Ej: 400
    duracion_dias = Column(Integer) # Ej: 90

class JuntaAsignada(Base):
    __tablename__ = "juntas_asignadas"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"))
    junta_catalogo_id = Column(Integer, ForeignKey("juntas_catalogo.id"))
    fecha_inicio = Column(Date) # Siempre será el 1 del mes
    fecha_fin = Column(Date)    # Siempre será fin de mes (5to mes)
    fecha_desembolso = Column(Date) # El día exacto en que tu mamá le da la plata
    monto_a_entregar = Column(Float) # Lo que tu mamá le dará (con o sin descuento)
    cuota_diaria = Column(Float)
    mes_desembolso_num = Column(Integer) # El turno (1 al 5)
    activa = Column(Boolean, default=True)

    cliente = relationship("Cliente", back_populates="juntas")

class MovimientoCuenta(Base):
    __tablename__ = "cuenta_corriente"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"))
    
    # Para saber a qué junta exacta pertenece este pago o deuda
    junta_asignada_id = Column(Integer, ForeignKey("juntas_asignadas.id"), nullable=True) 
    
    fecha = Column(Date)
    tipo_movimiento = Column(String) 
    monto = Column(Float) 

    cliente = relationship("Cliente", back_populates="movimientos")