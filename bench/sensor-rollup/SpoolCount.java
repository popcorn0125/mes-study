import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 스풀 CSV에 남은 원본 행 수(= 서버가 받은 센서 값). 복구 확인에서 정답으로 쓴다.
 *   java -cp <duckdb_jdbc.jar> bench/sensor-rollup/SpoolCount.java 'data/spool/*.csv' [이 시각(epoch ms) 이전만]
 */
public class SpoolCount {
    public static void main(String[] args) throws Exception {
        String where = args.length > 1 ? " WHERE epoch_ms(recorded_at) < " + args[1] : "";
        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement();
                ResultSet rs = st.executeQuery("SELECT count(*) FROM read_csv('" + args[0] + "', header=true, columns="
                        + "{'equipment_id':'VARCHAR','recorded_at':'TIMESTAMPTZ','status':'VARCHAR','work_order_id':'VARCHAR',"
                        + "'temperature':'DECIMAL(5,2)','vibration':'DECIMAL(5,2)','alarm_code':'VARCHAR'})" + where)) {
            rs.next();
            System.out.println(rs.getLong(1));
        }
    }
}
