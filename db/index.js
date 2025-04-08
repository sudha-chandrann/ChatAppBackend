import mongoose from "mongoose";

const connectDB= async()=>{
    try{
      const connectionInstance=  await mongoose.connect(`${process.env.MONGODB_URI}/${process.env.DB_NAME}`)
      const connection=connectionInstance.connection
      connection.on('connected',()=>{
        console.log('connected to database')
      })
      connection.on('error', (err) => {
        console.error("something is wrong in mongodb connection",err.message);
      })
    }
    catch(error){
        console.log("MONGODB connection error ",error);
        process.exit(1)
    }
}

export default connectDB;