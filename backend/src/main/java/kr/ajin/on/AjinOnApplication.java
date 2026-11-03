package kr.ajin.on;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AjinOnApplication {
    public static void main(String[] args) {
        SpringApplication.run(AjinOnApplication.class, args);
    }
}
