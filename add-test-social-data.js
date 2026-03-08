import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:Pocitac8@localhost:5432/ppya',
  ssl: false,
});

async function addTestData() {
  try {
    console.log('Connecting to database...');
    const result = await pool.query(
      `UPDATE politicians SET 
        instagram = 'testprofile', 
        facebook = 'test.politican', 
        twitter = 'testhandle' 
       WHERE id = 1 
       RETURNING id, full_name, instagram, facebook, twitter`
    );
    
    if (result.rows.length > 0) {
      console.log('✓ Test data added successfully:');
      console.log(result.rows[0]);
    } else {
      console.log('No politician with id=1 found');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

addTestData();
